import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type ConfigModule = typeof import("./config");

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

interface LoadedConfig {
  config: ConfigModule;
  tempRoot: string;
  restore: () => void;
}

async function loadConfigModule(options: {
  configJson?: string;
  proxies?: { dir: "config" | "input"; contents: string };
}): Promise<LoadedConfig> {
  const previous = {
    TEST_PROJECT_ROOT: process.env.TEST_PROJECT_ROOT,
    DASHBOARD_HOST: process.env.DASHBOARD_HOST,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
    DASHBOARD_PORT: process.env.DASHBOARD_PORT,
    DASHBOARD_REQUIRE_PASSWORD: process.env.DASHBOARD_REQUIRE_PASSWORD,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    CAPTCHA_PROVIDER: process.env.CAPTCHA_PROVIDER,
    CAPTCHA_API_KEY: process.env.CAPTCHA_API_KEY,
    CONFIG_JSON: process.env.CONFIG_JSON,
    ACCOUNTS_JSON: process.env.ACCOUNTS_JSON,
    PORT: process.env.PORT,
    TEST_MODE: process.env.TEST_MODE,
  };
  const tempRoot = await mkdtemp(join(tmpdir(), "roappeal-oss-config-"));

  if (options.configJson !== undefined) {
    await mkdir(join(tempRoot, "config"), { recursive: true });
    await writeFile(join(tempRoot, "config", "config.json"), options.configJson, "utf8");
  }
  if (options.proxies) {
    const dir = join(tempRoot, options.proxies.dir);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "proxies.txt"), options.proxies.contents, "utf8");
  }

  process.env.TEST_PROJECT_ROOT = tempRoot;
  delete process.env.DASHBOARD_HOST;
  delete process.env.DASHBOARD_PASSWORD;
  delete process.env.DASHBOARD_PORT;
  delete process.env.DASHBOARD_REQUIRE_PASSWORD;
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.AI_PROVIDER;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.CAPTCHA_PROVIDER;
  delete process.env.CAPTCHA_API_KEY;
  delete process.env.CONFIG_JSON;
  delete process.env.ACCOUNTS_JSON;
  delete process.env.PORT;
  delete process.env.TEST_MODE;

  return {
    config: (await import(`./config.ts?test=${crypto.randomUUID()}`)) as ConfigModule,
    tempRoot,
    restore: () => restoreEnv(previous),
  };
}

const VALID_ACCOUNT = {
  username: "ExampleUser",
  email: "user@gmail.com",
  app_password: "abcd efgh ijkl mnop",
};

const VALID_CONFIG = {
  accounts: [VALID_ACCOUNT],
  captcha: { provider: "cds", api_key: "captcha-key-value" },
  ai: { model: "openai/gpt-4o-mini", api_key: "ai-key-value" },
};

const FAKE_DISCORD_WEBHOOK_URL = [
  "https://discord.com/api",
  "webhooks",
  "123456789012345678",
  "abcdefghijklmnopqrstuvwxyz_ABC-123",
].join("/");

describe("config error dashboard fallback", () => {
  test("reads port from a parseable invalid config; host is loopback default", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({ accounts: [], dashboard: { enabled: true, port: 3456 } }),
    });

    try {
      expect(() => config.loadConfig()).toThrow('"accounts" must be a non-empty array');
      expect(config.loadConfigErrorDashboardConfig()).toEqual({ host: "127.0.0.1", port: 3456 });
    } finally {
      restore();
    }
  });

  test("falls back to loopback defaults when config json is invalid", async () => {
    const { config, restore } = await loadConfigModule({ configJson: "{" });

    try {
      expect(config.loadConfigErrorDashboardConfig()).toEqual({ host: "127.0.0.1", port: 3000 });
    } finally {
      restore();
    }
  });

  test("DASHBOARD_HOST env controls the bind host", async () => {
    const { config, restore } = await loadConfigModule({ configJson: "{" });

    try {
      process.env.DASHBOARD_HOST = "0.0.0.0";
      expect(config.loadConfigErrorDashboardConfig().host).toBe("0.0.0.0");
    } finally {
      restore();
    }
  });

  test("uses Railway PORT when DASHBOARD_PORT is unset", async () => {
    const { config, restore } = await loadConfigModule({ configJson: "{" });

    try {
      process.env.PORT = "8080";
      expect(config.loadConfigErrorDashboardConfig().port).toBe(8080);
    } finally {
      restore();
    }
  });
});

describe("test mode config", () => {
  test("loads an in-memory test config without required secrets", async () => {
    const { config, restore } = await loadConfigModule({ configJson: "{" });

    try {
      process.env.TEST_MODE = "1";
      process.env.DASHBOARD_PASSWORD = "local-test-password";

      expect(config.isTestMode()).toBe(true);
      expect(config.loadTestConfig()).toMatchObject({
        accounts: [
          { username: "TestAccount1" },
          { username: "TestAccount2" },
          { username: "TestAccount3" },
          { username: "TestAccount4" },
        ],
        captcha: { provider: "cds", api_key: "test-captcha-key" },
        ai: { model: "test-model", api_key: "test-ai-key" },
        dashboard: {
          enabled: true,
          host: "127.0.0.1",
          port: 3000,
          password: "local-test-password",
        },
      });
    } finally {
      restore();
    }
  });

  test("enables test mode from config before validating real secrets", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({ test_mode: true, dashboard: { enabled: true, port: 4567 } }),
    });

    try {
      expect(config.isTestMode()).toBe(true);
      expect(config.loadTestConfig()).toMatchObject({
        dashboard: { enabled: true, host: "127.0.0.1", port: 4567, password: "test" },
      });
    } finally {
      restore();
    }
  });

  test("uses dashboard password settings from config in test mode", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        test_mode: true,
        dashboard: {
          enabled: true,
          require_password: true,
          password: "preview-password",
        },
      }),
    });

    try {
      expect(config.loadTestConfig()).toMatchObject({
        dashboard: {
          require_password: true,
          password: "preview-password",
        },
      });
    } finally {
      restore();
    }
  });

  test("lets DASHBOARD_REQUIRE_PASSWORD override test mode config", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        test_mode: true,
        dashboard: { enabled: true, require_password: true },
      }),
    });

    try {
      process.env.DASHBOARD_REQUIRE_PASSWORD = "false";
      expect(config.loadTestConfig().dashboard?.require_password).toBe(false);
    } finally {
      restore();
    }
  });

  test("validates test_mode type in full config loading", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({ test_mode: "true", accounts: [] }),
    });

    try {
      expect(config.isTestMode()).toBe(false);
      expect(() => config.loadConfig()).toThrow('"test_mode" must be a boolean');
    } finally {
      restore();
    }
  });
});

describe("account email + app password", () => {
  test("loads a valid config with app_password", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({ ...VALID_CONFIG, dashboard: { enabled: true } }),
    });

    try {
      const loaded = config.loadConfig();
      expect(loaded.accounts[0]?.app_password).toBe("abcd efgh ijkl mnop");
      expect(loaded.dashboard?.host).toBe("127.0.0.1");
      expect(loaded.dashboard?.require_password).toBe(false);
      expect(loaded.same_email_submission_delay_minutes).toBe(5);
    } finally {
      restore();
    }
  });

  test("loads same-email submission delay from config", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        same_email_submission_delay_minutes: 8,
      }),
    });

    try {
      expect(config.loadConfig().same_email_submission_delay_minutes).toBe(8);
    } finally {
      restore();
    }
  });

  test("accepts a valid Discord webhook URL", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        dashboard: {
          enabled: true,
          discord_webhook_url: FAKE_DISCORD_WEBHOOK_URL,
        },
      }),
    });

    try {
      expect(config.loadConfig().dashboard?.discord_webhook_url).toBe(FAKE_DISCORD_WEBHOOK_URL);
    } finally {
      restore();
    }
  });

  test("loads full config from CONFIG_JSON", async () => {
    const { config, restore } = await loadConfigModule({});

    try {
      process.env.CONFIG_JSON = JSON.stringify({
        ...VALID_CONFIG,
        dashboard: { enabled: true, require_password: true, password: "env:DASHBOARD_PASSWORD" },
      });
      process.env.DASHBOARD_PASSWORD = "railway-dashboard-password";

      expect(config.loadConfig()).toMatchObject({
        accounts: [{ username: "ExampleUser" }],
        dashboard: {
          enabled: true,
          host: "127.0.0.1",
          password: "railway-dashboard-password",
        },
      });
    } finally {
      restore();
    }
  });

  test("loads env-only Railway config from ACCOUNTS_JSON", async () => {
    const { config, restore } = await loadConfigModule({});

    try {
      process.env.ACCOUNTS_JSON = JSON.stringify([VALID_ACCOUNT]);
      process.env.AI_GATEWAY_API_KEY = "ai-key-value";
      process.env.CAPTCHA_API_KEY = "captcha-key-value";
      process.env.PORT = "8080";

      expect(config.loadConfig()).toMatchObject({
        accounts: [{ username: "ExampleUser" }],
        captcha: { provider: "cds", api_key: "captcha-key-value" },
        ai: { provider: "gateway", model: "openai/gpt-4o-mini", api_key: "ai-key-value" },
        dashboard: { enabled: true, host: "127.0.0.1", port: 8080 },
      });
    } finally {
      restore();
    }
  });

  test("loads Groq AI config from config and environment", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        ai: {
          provider: "groq",
          model: "openai/gpt-oss-120b",
          api_key: "env:GROQ_API_KEY",
        },
      }),
    });

    try {
      process.env.GROQ_API_KEY = "groq-key-value";

      expect(config.loadConfig().ai).toEqual({
        provider: "groq",
        model: "openai/gpt-oss-120b",
        api_key: "groq-key-value",
      });
    } finally {
      restore();
    }
  });

  test("uses Groq by default for env-only deployments", async () => {
    const { config, restore } = await loadConfigModule({});

    try {
      process.env.ACCOUNTS_JSON = JSON.stringify([VALID_ACCOUNT]);
      process.env.GROQ_API_KEY = "groq-key-value";
      process.env.CAPTCHA_API_KEY = "captcha-key-value";

      expect(config.loadConfig()).toMatchObject({
        accounts: [{ username: "ExampleUser" }],
        ai: {
          provider: "groq",
          model: "openai/gpt-oss-120b",
          api_key: "groq-key-value",
        },
      });
    } finally {
      restore();
    }
  });

  test("infers Groq for the recommended gpt-oss model", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        ai: {
          model: "openai/gpt-oss-120b",
          api_key: "env:GROQ_API_KEY",
        },
      }),
    });

    try {
      process.env.GROQ_API_KEY = "groq-key-value";

      expect(config.loadConfig().ai).toEqual({
        provider: "groq",
        model: "openai/gpt-oss-120b",
        api_key: "groq-key-value",
      });
    } finally {
      restore();
    }
  });

  test("rejects unknown AI providers", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        ai: { provider: "unknown", model: "test-model", api_key: "ai-key-value" },
      }),
    });

    try {
      expect(() => config.loadConfig()).toThrow(/ai\.provider/);
    } finally {
      restore();
    }
  });

  test("rejects invalid Discord webhook URLs", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        dashboard: {
          enabled: true,
          discord_webhook_url: "https://example.com/not-a-webhook",
        },
      }),
    });

    try {
      expect(() => config.loadConfig()).toThrow(/valid Discord webhook URL/);
    } finally {
      restore();
    }
  });

  test("accepts the legacy gmail_app_password alias", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        accounts: [
          {
            username: "ExampleUser",
            email: "user@gmail.com",
            gmail_app_password: "abcd efgh ijkl",
          },
        ],
      }),
    });

    try {
      expect(config.loadConfig().accounts[0]?.app_password).toBe("abcd efgh ijkl");
    } finally {
      restore();
    }
  });

  test("accepts an Outlook/Microsoft email address", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        accounts: [{ ...VALID_ACCOUNT, email: "user@outlook.com" }],
      }),
    });

    try {
      expect(config.loadConfig().accounts[0]?.email).toBe("user@outlook.com");
    } finally {
      restore();
    }
  });

  test("rejects unsafe placeholder secrets", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        accounts: [{ ...VALID_ACCOUNT, app_password: "your-app-password" }],
      }),
    });

    try {
      expect(() => config.loadConfig()).toThrow();
    } finally {
      restore();
    }
  });

  test("requires imap_server for an unrecognized provider", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        accounts: [{ ...VALID_ACCOUNT, email: "user@self-hosted.example" }],
      }),
    });

    try {
      expect(() => config.loadConfig()).toThrow(/imap_server/);
    } finally {
      restore();
    }
  });

  test("accepts an unrecognized provider when imap_server is set", async () => {
    const { config, restore } = await loadConfigModule({
      configJson: JSON.stringify({
        ...VALID_CONFIG,
        accounts: [
          { ...VALID_ACCOUNT, email: "user@self-hosted.example", imap_server: "mail.example.net" },
        ],
      }),
    });

    try {
      expect(config.loadConfig().accounts[0]?.imap_server).toBe("mail.example.net");
    } finally {
      restore();
    }
  });
});

describe("captcha config", () => {
  test("accepts supported captcha providers and the legacy CDS alias", async () => {
    for (const provider of ["2captcha", "cds", "funbypass", "cds-solver"] as const) {
      const { config, restore } = await loadConfigModule({
        configJson: JSON.stringify({
          ...VALID_CONFIG,
          captcha: { provider, api_key: "captcha-key-value" },
        }),
      });

      try {
        expect(config.loadConfig().captcha.provider).toBe(provider);
      } finally {
        restore();
      }
    }
  });
});

describe("proxies", () => {
  test("reads proxies from config/proxies.txt", async () => {
    const { config, restore } = await loadConfigModule({
      proxies: { dir: "config", contents: "socks5://host-a:1080\nhttp://host-b:8080\n" },
    });

    try {
      expect(config.loadProxies()).toEqual(["socks5://host-a:1080", "http://host-b:8080"]);
    } finally {
      restore();
    }
  });

  test("normalizes provider host-port-user-pass proxy URLs", async () => {
    const { config, restore } = await loadConfigModule({
      proxies: {
        dir: "config",
        contents:
          "socks5://budget.legionproxy.test:1337:uorder123_fastmode-true_country-US_session-abc_sesstime-4:proxyPassword\n",
      },
    });

    try {
      expect(config.loadProxies()).toEqual([
        "socks5://uorder123_fastmode-true_country-US_session-abc_sesstime-4:proxyPassword@budget.legionproxy.test:1337",
      ]);
    } finally {
      restore();
    }
  });

  test("rejects malformed proxies with a line-numbered error", async () => {
    const { config, restore } = await loadConfigModule({
      proxies: { dir: "config", contents: "socks5://host:bad-port:user:pass\n" },
    });

    try {
      expect(() => config.loadProxies()).toThrow(/line 1/u);
    } finally {
      restore();
    }
  });

  test("falls back to legacy input/proxies.txt", async () => {
    const { config, restore } = await loadConfigModule({
      proxies: { dir: "input", contents: "socks5://legacy-host:1080\n" },
    });

    try {
      expect(config.loadProxies()).toEqual(["socks5://legacy-host:1080"]);
    } finally {
      restore();
    }
  });
});
