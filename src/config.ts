import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AccountConfig,
  AiConfig,
  AppConfig,
  CaptchaConfig,
  CaptchaProvider,
  DashboardConfig,
} from "./types";
import { isValidDiscordWebhookUrl } from "./modules/discordWebhook";
import { imapHostForEmail, SUPPORTED_EMAIL_PROVIDERS } from "./modules/emailProviders";

const moduleDir = dirname(fileURLToPath(import.meta.url));

function detectProjectRoot(): string {
  const executableDir = dirname(process.execPath);
  const candidates = [
    process.cwd(),
    executableDir,
    resolve(executableDir, ".."),
    resolve(moduleDir, ".."),
    resolve(moduleDir, "..", ".."),
  ];

  for (const candidate of candidates) {
    if (
      existsSync(resolve(candidate, "config", "config.json")) ||
      existsSync(resolve(candidate, "config", "config.example.json")) ||
      existsSync(resolve(candidate, "Config", "config.json")) ||
      existsSync(resolve(candidate, "Config", "config.example.json")) ||
      existsSync(resolve(candidate, "package.json"))
    ) {
      return candidate;
    }
  }

  return resolve(moduleDir, "..");
}

export const PROJECT_ROOT = process.env.TEST_PROJECT_ROOT
  ? resolve(process.env.TEST_PROJECT_ROOT)
  : detectProjectRoot();
const DEFAULT_CONFIG_PATH = resolve(PROJECT_ROOT, "config", "config.json");
const LEGACY_CONFIG_PATH = resolve(PROJECT_ROOT, "Config", "config.json");
const DEFAULT_PROXIES_PATH = resolve(PROJECT_ROOT, "config", "proxies.txt");
// Older layouts kept proxies under input/; still honored if config/proxies.txt
// is absent so existing setups keep working.
const LEGACY_PROXIES_PATHS = [
  resolve(PROJECT_ROOT, "input", "proxies.txt"),
  resolve(PROJECT_ROOT, "Input", "proxies.txt"),
];
const FALLBACK_DASHBOARD_HOST = "127.0.0.1";
const FALLBACK_DASHBOARD_PORT = 3000;
const DEFAULT_AI_MODEL = "openai/gpt-4o-mini";

export const CONFIG_PATH = process.env.CONFIG_PATH
  ? resolve(process.env.CONFIG_PATH)
  : existsSync(DEFAULT_CONFIG_PATH) || !existsSync(LEGACY_CONFIG_PATH)
    ? DEFAULT_CONFIG_PATH
    : LEGACY_CONFIG_PATH;
export const PROXIES_PATH = existsSync(DEFAULT_PROXIES_PATH)
  ? DEFAULT_PROXIES_PATH
  : (LEGACY_PROXIES_PATHS.find((path) => existsSync(path)) ?? DEFAULT_PROXIES_PATH);

export type ConfigErrorDashboardConfig = {
  host: string;
  port: number;
};

const UNSAFE_SECRET_VALUES = new Set([
  "admin",
  "change-me",
  "changeme",
  "password",
  "password123",
  "...",
  "todo",
  "your-password",
  "your-gmail-app-password",
]);

const APP_CONFIG_KEYS = new Set([
  "$schema",
  "test_mode",
  "accounts",
  "captcha",
  "ai",
  "check_interval_minutes",
  "rejection_wait_minutes",
  "same_email_submission_delay_minutes",
  "dashboard",
]);

const CAPTCHA_PROVIDERS = new Set<CaptchaProvider>(["2captcha", "cds", "cds-solver", "funbypass"]);

const CAPTCHA_CONFIG_KEYS = new Set(["provider", "api_key"]);

const AI_CONFIG_KEYS = new Set(["model", "api_key"]);

const ACCOUNT_CONFIG_KEYS = new Set([
  "username",
  "email",
  "app_password",
  // Deprecated alias, still accepted for backward compatibility.
  "gmail_app_password",
  "imap_server",
  "imap_port",
]);

// Note: the dashboard bind host is intentionally NOT a config.json field — it is
// controlled only by the DASHBOARD_HOST env var (defaults to 127.0.0.1).
const DASHBOARD_CONFIG_KEYS = new Set([
  "enabled",
  "port",
  "require_password",
  "password",
  "discord_webhook_url",
]);

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const SUPPORTED_PROXY_PROTOCOLS = new Set(["http:", "https:", "socks4:", "socks5:"]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown config key "${label}.${key}"`);
    }
  }
}

function isSampleProxy(proxy: string): boolean {
  const normalized = proxy.trim().toLowerCase();
  return (
    normalized === "socks5://user:pass@host:port" ||
    normalized === "socks5://host:port:user:pass" ||
    normalized === "http://user:pass@host:port" ||
    normalized === "http://host:port:user:pass" ||
    normalized.includes("user:pass@host:port")
  );
}

function normalizeProviderProxyUrl(proxy: string): string | undefined {
  const match = /^(https?|socks[45]):\/\/(.+)$/iu.exec(proxy);
  if (!match) {
    return undefined;
  }

  const [, scheme, authority] = match;
  if (!scheme || !authority) {
    return undefined;
  }

  const [host, port, username, ...passwordParts] = authority.split(":");
  const password = passwordParts.join(":");
  if (!host || !port || !username || !password || !/^\d+$/u.test(port)) {
    return undefined;
  }

  return `${scheme.toLowerCase()}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function assertSupportedProxyUrl(proxy: string, lineNumber: number): void {
  let url: URL;
  try {
    url = new URL(proxy);
  } catch {
    throw new Error(
      `Invalid proxy URL in ${PROXIES_PATH} on line ${lineNumber}. Use user:pass@host:port URL format or provider host:port:user:pass format.`,
    );
  }

  if (!SUPPORTED_PROXY_PROTOCOLS.has(url.protocol) || !url.hostname) {
    throw new Error(
      `Invalid proxy URL in ${PROXIES_PATH} on line ${lineNumber}. Supported schemes are http, https, socks4, and socks5.`,
    );
  }
}

function normalizeProxy(proxy: string, lineNumber: number): string {
  try {
    assertSupportedProxyUrl(proxy, lineNumber);
    return proxy;
  } catch {
    const normalized = normalizeProviderProxyUrl(proxy);
    if (normalized) {
      assertSupportedProxyUrl(normalized, lineNumber);
      return normalized;
    }

    assertSupportedProxyUrl(proxy, lineNumber);
    return proxy;
  }
}

function envValue(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parseConfigJson(source: string, label: string): Partial<AppConfig> {
  const parsed = JSON.parse(source) as unknown;
  const record = recordValue(parsed);
  if (!record) {
    throw new Error(`${label} must be a JSON object`);
  }

  return record as Partial<AppConfig>;
}

function loadRawConfig(): Partial<AppConfig> {
  const inlineConfig = envValue("CONFIG_JSON");
  if (inlineConfig) {
    return parseConfigJson(inlineConfig, "CONFIG_JSON");
  }

  if (existsSync(CONFIG_PATH)) {
    return parseConfigJson(readFileSync(CONFIG_PATH, "utf8"), CONFIG_PATH);
  }

  if (envValue("ACCOUNTS_JSON")) {
    return {
      accounts: [],
      captcha: {
        provider: "cds",
        api_key: "env:CAPTCHA_API_KEY",
      },
      ai: {
        model: DEFAULT_AI_MODEL,
        api_key: "env:AI_GATEWAY_API_KEY",
      },
      dashboard: {
        enabled: true,
        require_password: false,
        password: "env:DASHBOARD_PASSWORD",
        discord_webhook_url: "env:DISCORD_WEBHOOK_URL",
      },
    };
  }

  throw new Error(`Missing config file: ${CONFIG_PATH}`);
}

export function isTestMode(): boolean {
  const value = envValue("TEST_MODE")?.toLowerCase();
  if (process.argv.includes("--test-mode") || (value ? TRUE_VALUES.has(value) : false)) {
    return true;
  }

  if (!existsSync(CONFIG_PATH) && !envValue("CONFIG_JSON")) {
    return false;
  }

  try {
    const parsed = recordValue(loadRawConfig());
    return parsed?.test_mode === true;
  } catch {
    return false;
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function validPort(value: unknown): number | undefined {
  const port =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number.parseInt(value, 10)
        : undefined;

  if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
    return undefined;
  }

  return port;
}

export function loadConfigErrorDashboardConfig(): ConfigErrorDashboardConfig {
  let parsed: Record<string, unknown> | undefined;
  const inlineConfig = envValue("CONFIG_JSON");
  if (inlineConfig) {
    try {
      parsed = recordValue(parseConfigJson(inlineConfig, "CONFIG_JSON"));
    } catch {
      parsed = undefined;
    }
  } else if (existsSync(CONFIG_PATH)) {
    try {
      parsed = recordValue(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
    } catch {
      parsed = undefined;
    }
  }

  const dashboard = recordValue(parsed?.dashboard);
  // Bind host is env-only (DASHBOARD_HOST); not read from config.json.
  const host = envValue("DASHBOARD_HOST") ?? FALLBACK_DASHBOARD_HOST;
  const port =
    validPort(envValue("DASHBOARD_PORT") ?? envValue("PORT") ?? dashboard?.port) ??
    FALLBACK_DASHBOARD_PORT;

  return { host, port };
}

function loadTestDashboardConfigOverrides(): Partial<DashboardConfig> {
  try {
    const parsed = loadRawConfig();
    return recordValue(parsed.dashboard) ?? {};
  } catch {
    return {};
  }
}

export function loadTestConfig(): AppConfig {
  const dashboard = loadConfigErrorDashboardConfig();
  const dashboardOverrides = loadTestDashboardConfigOverrides();
  const requirePasswordEnv = envValue("DASHBOARD_REQUIRE_PASSWORD")?.toLowerCase();
  const password =
    envValue("DASHBOARD_PASSWORD") ??
    resolveOptionalSecret(dashboardOverrides.password, "dashboard.password") ??
    "test";

  return {
    accounts: [
      {
        username: "TestAccount1",
        email: "appeals.primary@gmail.com",
        app_password: "test-password",
      },
      {
        username: "TestAccount2",
        email: "appeals.primary@gmail.com",
        app_password: "test-password",
      },
      {
        username: "TestAccount3",
        email: "support.queue@outlook.com",
        app_password: "test-password",
      },
      {
        username: "TestAccount4",
        email: "support.queue@outlook.com",
        app_password: "test-password",
      },
    ],
    captcha: {
      provider: "cds",
      api_key: "test-captcha-key",
    },
    ai: {
      model: "test-model",
      api_key: "test-ai-key",
    },
    check_interval_minutes: 1,
    rejection_wait_minutes: 1,
    same_email_submission_delay_minutes: 5,
    dashboard: {
      enabled: true,
      host: dashboard.host,
      port: dashboard.port,
      require_password:
        requirePasswordEnv !== undefined
          ? TRUE_VALUES.has(requirePasswordEnv)
          : dashboardOverrides.require_password === true,
      password,
    },
  };
}

function resolveSecret(value: unknown, fieldName: string): string | undefined {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("env:")) {
    const envName = trimmed.slice(4).trim();
    if (!envName) {
      throw new Error(`"${fieldName}" references an empty environment variable name`);
    }

    const resolved = envValue(envName);
    if (!resolved) {
      throw new Error(`"${fieldName}" requires environment variable ${envName}`);
    }

    return resolved;
  }

  return trimmed;
}

function resolveOptionalSecret(value: unknown, fieldName: string): string | undefined {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("env:")) {
    const envName = trimmed.slice(4).trim();
    if (!envName) {
      throw new Error(`"${fieldName}" references an empty environment variable name`);
    }

    return envValue(envName);
  }

  return trimmed;
}

function isUnsafeSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    UNSAFE_SECRET_VALUES.has(normalized) ||
    normalized.startsWith("your_") ||
    normalized.startsWith("your-") ||
    normalized.includes("your_") ||
    normalized.includes("your-") ||
    normalized.includes("example") ||
    normalized.includes("placeholder")
  );
}

function assertSafeSecret(value: string, fieldName: string): void {
  if (isUnsafeSecret(value)) {
    throw new Error(`"${fieldName}" is using an unsafe placeholder/default value`);
  }
}

function validateAccount(
  account: Partial<AccountConfig>,
  index: number,
): asserts account is AccountConfig {
  assertKnownKeys(account as Record<string, unknown>, ACCOUNT_CONFIG_KEYS, `accounts[${index}]`);

  if (!isNonEmptyString(account.username)) {
    throw new Error(`Account ${index + 1} is missing "username"`);
  }

  if (!isNonEmptyString(account.email)) {
    throw new Error(`Account ${index + 1} is missing "email"`);
  }

  // Accept the provider-neutral `app_password`, falling back to the legacy
  // `gmail_app_password` alias so existing configs keep working.
  const accountRecord = account as Record<string, unknown>;
  const rawPassword = account.app_password ?? accountRecord.gmail_app_password;
  account.app_password = resolveSecret(rawPassword, `accounts[${index}].app_password`);
  if (!isNonEmptyString(account.app_password)) {
    throw new Error(`Account ${index + 1} is missing "app_password"`);
  }
  delete accountRecord.gmail_app_password;

  assertSafeSecret(account.app_password, `accounts[${index}].app_password`);

  if (
    account.imap_port !== undefined &&
    (!Number.isInteger(account.imap_port) || account.imap_port < 1 || account.imap_port > 65535)
  ) {
    throw new Error(`"accounts[${index}].imap_port" must be a valid TCP port`);
  }

  // The IMAP host is auto-detected from the email domain for known providers;
  // any other provider needs an explicit imap_server.
  if (!isNonEmptyString(account.imap_server) && !imapHostForEmail(account.email)) {
    throw new Error(
      `Account ${index + 1}: could not auto-detect an IMAP server for "${account.email}". ` +
        `Set "imap_server" (and "imap_port" if needed), or use a supported provider (${SUPPORTED_EMAIL_PROVIDERS}).`,
    );
  }
}

function validateAiConfig(ai: Partial<AiConfig> | undefined): asserts ai is AiConfig {
  if (!ai || typeof ai !== "object") {
    throw new Error(`"ai" is required in ${CONFIG_PATH}`);
  }

  assertKnownKeys(ai as Record<string, unknown>, AI_CONFIG_KEYS, "ai");

  if (!isNonEmptyString(ai.model)) {
    throw new Error(`"ai.model" is required in ${CONFIG_PATH}`);
  }

  ai.api_key = resolveSecret(ai.api_key, "ai.api_key");
  if (!isNonEmptyString(ai.api_key)) {
    throw new Error(`"ai.api_key" is required in ${CONFIG_PATH}`);
  }

  assertSafeSecret(ai.api_key, "ai.api_key");
}

function validateCaptchaConfig(
  captcha: Partial<CaptchaConfig> | undefined,
): asserts captcha is CaptchaConfig {
  if (!captcha || typeof captcha !== "object") {
    throw new Error(`"captcha" is required in ${CONFIG_PATH}`);
  }

  assertKnownKeys(captcha as Record<string, unknown>, CAPTCHA_CONFIG_KEYS, "captcha");

  if (!isNonEmptyString(captcha.provider)) {
    throw new Error(`"captcha.provider" is required in ${CONFIG_PATH}`);
  }

  if (!CAPTCHA_PROVIDERS.has(captcha.provider as CaptchaProvider)) {
    throw new Error(
      `"captcha.provider" must be one of: ${Array.from(CAPTCHA_PROVIDERS).join(", ")}`,
    );
  }

  captcha.api_key = resolveSecret(captcha.api_key, "captcha.api_key");
  if (!isNonEmptyString(captcha.api_key)) {
    throw new Error(`"captcha.api_key" is required in ${CONFIG_PATH}`);
  }

  assertSafeSecret(captcha.api_key, "captcha.api_key");
}

function parseAccountsFromEnv(): AccountConfig[] | undefined {
  const raw = envValue("ACCOUNTS_JSON");
  if (!raw) {
    return undefined;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("ACCOUNTS_JSON must be a JSON array");
  }

  return parsed as AccountConfig[];
}

export function loadConfig(): AppConfig {
  const parsed = loadRawConfig();
  assertKnownKeys(parsed as Record<string, unknown>, APP_CONFIG_KEYS, "config");

  if (parsed.test_mode !== undefined && typeof parsed.test_mode !== "boolean") {
    throw new Error(`"test_mode" must be a boolean`);
  }

  parsed.accounts = parseAccountsFromEnv() ?? parsed.accounts;
  parsed.captcha ??= {} as Partial<CaptchaConfig> as CaptchaConfig;
  parsed.captcha.provider =
    (envValue("CAPTCHA_PROVIDER") as CaptchaProvider | undefined) ?? parsed.captcha.provider;
  parsed.captcha.api_key = envValue("CAPTCHA_API_KEY") ?? parsed.captcha.api_key;
  parsed.ai ??= {} as Partial<AiConfig> as AiConfig;
  parsed.ai.model = envValue("AI_MODEL") ?? parsed.ai.model ?? DEFAULT_AI_MODEL;
  parsed.ai.api_key = envValue("AI_GATEWAY_API_KEY") ?? parsed.ai.api_key;

  if (parsed.dashboard) {
    assertKnownKeys(
      parsed.dashboard as unknown as Record<string, unknown>,
      DASHBOARD_CONFIG_KEYS,
      "dashboard",
    );

    const requirePasswordEnv = envValue("DASHBOARD_REQUIRE_PASSWORD")?.toLowerCase();
    if (requirePasswordEnv !== undefined) {
      parsed.dashboard.require_password = TRUE_VALUES.has(requirePasswordEnv);
    }

    parsed.dashboard.password = envValue("DASHBOARD_PASSWORD") ?? parsed.dashboard.password;
    parsed.dashboard.discord_webhook_url =
      envValue("DISCORD_WEBHOOK_URL") ?? parsed.dashboard.discord_webhook_url;
    parsed.dashboard.discord_webhook_url = resolveOptionalSecret(
      parsed.dashboard.discord_webhook_url,
      "dashboard.discord_webhook_url",
    );

    const dashboardPort = envValue("DASHBOARD_PORT") ?? envValue("PORT");
    if (dashboardPort) {
      parsed.dashboard.port = Number.parseInt(dashboardPort, 10);
    }
  }

  if (!Array.isArray(parsed.accounts) || parsed.accounts.length === 0) {
    throw new Error(`"accounts" must be a non-empty array in ${CONFIG_PATH}`);
  }

  parsed.accounts.forEach((account, index) => validateAccount(account, index));

  validateCaptchaConfig(parsed.captcha);
  validateAiConfig(parsed.ai);

  if (parsed.dashboard?.enabled) {
    const requirePassword = parsed.dashboard.require_password === true;
    parsed.dashboard.require_password = requirePassword;

    if (requirePassword) {
      parsed.dashboard.password =
        resolveSecret(parsed.dashboard.password, "dashboard.password") ?? "";
      if (!isNonEmptyString(parsed.dashboard.password)) {
        throw new Error(
          `"dashboard.password" is required when "dashboard.require_password" is true`,
        );
      }

      assertSafeSecret(parsed.dashboard.password, "dashboard.password");
    } else {
      parsed.dashboard.password =
        resolveOptionalSecret(parsed.dashboard.password, "dashboard.password") ?? "";
    }

    if (
      parsed.dashboard.port !== undefined &&
      (!Number.isInteger(parsed.dashboard.port) ||
        parsed.dashboard.port < 1 ||
        parsed.dashboard.port > 65535)
    ) {
      throw new Error(`"dashboard.port" must be a valid TCP port`);
    }

    if (
      parsed.dashboard.discord_webhook_url !== undefined &&
      !isValidDiscordWebhookUrl(parsed.dashboard.discord_webhook_url)
    ) {
      throw new Error(`"dashboard.discord_webhook_url" must be a valid Discord webhook URL`);
    }
  }

  if (
    parsed.check_interval_minutes !== undefined &&
    (!Number.isFinite(parsed.check_interval_minutes) || parsed.check_interval_minutes < 1)
  ) {
    throw new Error(`"check_interval_minutes" must be at least 1`);
  }

  if (
    parsed.rejection_wait_minutes !== undefined &&
    (!Number.isFinite(parsed.rejection_wait_minutes) || parsed.rejection_wait_minutes < 1)
  ) {
    throw new Error(`"rejection_wait_minutes" must be at least 1`);
  }

  if (
    parsed.same_email_submission_delay_minutes !== undefined &&
    (!Number.isFinite(parsed.same_email_submission_delay_minutes) ||
      parsed.same_email_submission_delay_minutes < 0)
  ) {
    throw new Error(`"same_email_submission_delay_minutes" must be at least 0`);
  }

  return {
    test_mode: parsed.test_mode ?? false,
    accounts: parsed.accounts,
    captcha: parsed.captcha,
    ai: parsed.ai,
    check_interval_minutes: parsed.check_interval_minutes ?? 15,
    rejection_wait_minutes: parsed.rejection_wait_minutes ?? 60,
    same_email_submission_delay_minutes: parsed.same_email_submission_delay_minutes ?? 5,
    dashboard: parsed.dashboard?.enabled
      ? {
          enabled: true,
          host: envValue("DASHBOARD_HOST") ?? "127.0.0.1",
          port: parsed.dashboard.port ?? 3000,
          require_password: parsed.dashboard.require_password === true,
          password: parsed.dashboard.password,
          discord_webhook_url: parsed.dashboard.discord_webhook_url,
        }
      : parsed.dashboard,
  };
}

export function loadProxies(): string[] {
  if (!existsSync(PROXIES_PATH)) {
    return [];
  }

  const proxies = readFileSync(PROXIES_PATH, "utf8")
    .split(/\r?\n/u)
    .map((line, index) => ({ proxy: line.trim(), lineNumber: index + 1 }))
    .filter(({ proxy }) => proxy.length > 0);

  if (proxies.length === 0) {
    return [];
  }

  const sampleProxies = proxies.filter(({ proxy }) => isSampleProxy(proxy));
  if (sampleProxies.length > 0) {
    throw new Error(
      `Sample proxies detected in ${PROXIES_PATH}. Replace the placeholder entries with real proxies.`,
    );
  }

  return proxies.map(({ proxy, lineNumber }) => normalizeProxy(proxy, lineNumber));
}
