import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { isTestMode, loadConfig, loadTestConfig } from "../config";

const SESSION_COOKIE = "appeal_tool_admin";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const sessions = new Map<string, number>();

function parseCookies(header?: string | null): Record<string, string> {
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const pair = part.trim();
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    cookies[pair.slice(0, separatorIndex)] = decodeURIComponent(pair.slice(separatorIndex + 1));
  }

  return cookies;
}

function hashValue(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function secureEquals(left: string, right: string): boolean {
  return timingSafeEqual(hashValue(left), hashValue(right));
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function dashboardAuthConfig(): { requirePassword: boolean; password: string } {
  try {
    const config = isTestMode() ? loadTestConfig() : loadConfig();
    return {
      requirePassword: config.dashboard?.require_password === true,
      password: config.dashboard?.password ?? "",
    };
  } catch {
    return { requirePassword: false, password: "" };
  }
}

export function isDashboardAuthenticated(request: Request): boolean {
  const auth = dashboardAuthConfig();
  if (!auth.requirePassword) {
    return true;
  }

  const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  if (!token) {
    return false;
  }

  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }

  return true;
}

export async function handleDashboardLogin(request: Request): Promise<Response> {
  const auth = dashboardAuthConfig();
  if (!auth.requirePassword) {
    return new Response(null, { status: 302, headers: { Location: "/dashboard" } });
  }

  const body = await request.text();
  const password = new URLSearchParams(body).get("password") ?? "";
  if (!secureEquals(password, auth.password)) {
    return new Response(null, { status: 302, headers: { Location: "/login?error=1" } });
  }

  const token = randomUUID();
  sessions.set(token, Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/dashboard",
      "Set-Cookie": sessionCookie(token),
    },
  });
}

export function handleDashboardLogout(request: Request): Response {
  const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
