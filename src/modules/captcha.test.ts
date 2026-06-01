import { describe, expect, test } from "bun:test";
import {
  CDS_BASE_URL,
  FUNBYPASS_BASE_URL,
  ROBLOX_ARKOSE_SUBDOMAIN,
  ROBLOX_SITE_KEY,
  ROBLOX_WEBSITE_URL,
  solveCaptcha,
  TWOCAPTCHA_BASE_URL,
} from "./captcha";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function parseJsonBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

async function withImmediateTimers<T>(callback: () => Promise<T>): Promise<T> {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((handler: TimerHandler, _timeout?: number, ...args: unknown[]) => {
    if (typeof handler === "function") {
      handler(...args);
    }

    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;

  try {
    return await callback();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
}

describe("captcha solvers", () => {
  test("solves with FunBypass using the Roblox FunCaptcha task shape", async () => {
    const originalFetch = globalThis.fetch;
    const calls: FetchCall[] = [];

    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });

      if (String(url) === `${FUNBYPASS_BASE_URL}/createTask`) {
        return new Response(JSON.stringify({ errorId: 0, taskId: "fb-task" }));
      }

      return new Response(
        JSON.stringify({ errorId: 0, status: "ready", solution: { token: "fb-token" } }),
      );
    }) as typeof fetch;

    try {
      const result = await withImmediateTimers(() =>
        solveCaptcha(
          { provider: "funbypass", api_key: "fb-key" },
          "captcha-blob",
          "socks5://user:pass@proxy.test:1080",
        ),
      );

      expect(result).toMatchObject({
        success: true,
        token: "fb-token",
        taskId: "fb-task",
        provider: "funbypass",
      });

      const createPayload = parseJsonBody(calls[0]?.init);
      expect(createPayload.clientKey).toBe("fb-key");
      expect(createPayload.task).toMatchObject({
        type: "FunCaptchaTask",
        websiteURL: ROBLOX_WEBSITE_URL,
        websitePublicKey: ROBLOX_SITE_KEY,
        websiteSubdomain: "roblox.com",
        proxy: "socks5://user:pass@proxy.test:1080",
        data: JSON.stringify({ blob: "captcha-blob" }),
      });
      expect(calls[1]?.url).toBe(`${FUNBYPASS_BASE_URL}/getTaskResult/fb-task`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("solves with 2Captcha proxyless tasks", async () => {
    const originalFetch = globalThis.fetch;
    const calls: FetchCall[] = [];

    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });

      if (String(url) === `${TWOCAPTCHA_BASE_URL}/createTask`) {
        return new Response(JSON.stringify({ errorId: 0, taskId: 12345 }));
      }

      return new Response(
        JSON.stringify({ errorId: 0, status: "ready", solution: { token: "two-token" } }),
      );
    }) as typeof fetch;

    try {
      const result = await withImmediateTimers(() =>
        solveCaptcha({ provider: "2captcha", api_key: "two-key" }, "captcha-blob"),
      );

      expect(result).toMatchObject({
        success: true,
        token: "two-token",
        taskId: "12345",
        provider: "2captcha",
      });

      const createPayload = parseJsonBody(calls[0]?.init);
      expect(createPayload.clientKey).toBe("two-key");
      expect(createPayload.task).toMatchObject({
        type: "FunCaptchaTaskProxyless",
        websiteURL: ROBLOX_WEBSITE_URL,
        websitePublicKey: ROBLOX_SITE_KEY,
        funcaptchaApiJSSubdomain: ROBLOX_ARKOSE_SUBDOMAIN,
        data: JSON.stringify({ blob: "captcha-blob" }),
      });
      expect(parseJsonBody(calls[1]?.init)).toEqual({
        clientKey: "two-key",
        taskId: "12345",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("solves with 2Captcha proxy tasks and splits URL proxy fields", async () => {
    const originalFetch = globalThis.fetch;
    const calls: FetchCall[] = [];

    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });

      if (String(url) === `${TWOCAPTCHA_BASE_URL}/createTask`) {
        return new Response(JSON.stringify({ errorId: 0, taskId: "two-proxy-task" }));
      }

      return new Response(
        JSON.stringify({ errorId: 0, status: "ready", solution: { token: "two-proxy-token" } }),
      );
    }) as typeof fetch;

    try {
      const result = await withImmediateTimers(() =>
        solveCaptcha(
          { provider: "2captcha", api_key: "two-key" },
          "captcha-blob",
          "socks5://proxy-user:proxy-pass@proxy.test:1080",
        ),
      );

      expect(result.success).toBe(true);

      const createPayload = parseJsonBody(calls[0]?.init);
      expect(createPayload.task).toMatchObject({
        type: "FunCaptchaTask",
        proxyType: "socks5",
        proxyAddress: "proxy.test",
        proxyPort: 1080,
        proxyLogin: "proxy-user",
        proxyPassword: "proxy-pass",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("keeps the legacy cds-solver provider alias mapped to CDS", async () => {
    const originalFetch = globalThis.fetch;
    const calls: FetchCall[] = [];

    globalThis.fetch = (async (url, init) => {
      calls.push({ url: String(url), init });

      if (String(url) === `${CDS_BASE_URL}/createTask`) {
        return new Response(JSON.stringify({ status: "started", task_id: "cds-task" }));
      }

      return new Response(JSON.stringify({ status: "success", token: "cds-token" }));
    }) as typeof fetch;

    try {
      const result = await withImmediateTimers(() =>
        solveCaptcha({ provider: "cds-solver", api_key: "cds-key" }, "captcha-blob"),
      );

      expect(result).toMatchObject({
        success: true,
        token: "cds-token",
        taskId: "cds-task",
        provider: "cds",
      });
      expect(calls[0]?.url).toBe(`${CDS_BASE_URL}/createTask`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
