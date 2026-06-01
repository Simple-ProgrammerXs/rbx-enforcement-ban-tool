import { describe, expect, test } from "bun:test";
import {
  buildDiscordWebhookTestPayload,
  DISCORD_FOOTER_ICON_URL,
  isDiscordWebhookTestEvent,
  isValidDiscordWebhookUrl,
  sendDiscordWebhook,
} from "./discordWebhook";

const FAKE_DISCORD_WEBHOOK_URL = [
  "https://discord.com/api",
  "webhooks",
  "123456789012345678",
  "abcdefghijklmnopqrstuvwxyz_ABC-123",
].join("/");

const FAKE_LEGACY_DISCORD_WEBHOOK_URL = [
  "https://discordapp.com/api",
  "webhooks",
  "123456789012345678",
  "abcdefghijklmnopqrstuvwxyz_ABC-123",
].join("/");

describe("discordWebhook", () => {
  test("validates Discord webhook URLs", () => {
    expect(isValidDiscordWebhookUrl(FAKE_DISCORD_WEBHOOK_URL)).toBe(true);
    expect(isValidDiscordWebhookUrl(FAKE_LEGACY_DISCORD_WEBHOOK_URL)).toBe(true);
    expect(isValidDiscordWebhookUrl("")).toBe(true);
    expect(isValidDiscordWebhookUrl("https://example.com/not-a-webhook")).toBe(false);
  });

  test("validates test events", () => {
    expect(isDiscordWebhookTestEvent("approved")).toBe(true);
    expect(isDiscordWebhookTestEvent("submitted")).toBe(true);
    expect(isDiscordWebhookTestEvent("rejected")).toBe(true);
    expect(isDiscordWebhookTestEvent("escalated")).toBe(true);
    expect(isDiscordWebhookTestEvent("unknown")).toBe(false);
  });

  test("builds event-specific test payloads", () => {
    const payload = buildDiscordWebhookTestPayload("approved") as {
      username?: string;
      embeds: Array<{
        title: string;
        description?: string;
        color: number;
        footer: { text: string; icon_url: string };
      }>;
    };

    expect(payload.username).toBeUndefined();
    expect(payload.embeds[0]?.title).toBe("Appeal Approved");
    expect(payload.embeds[0]?.description).toBeUndefined();
    expect(payload.embeds[0]?.color).toBe(0x22c55e);
    expect(payload.embeds[0]?.footer).toEqual({
      text: "Enforcement Ban Tool by RoAppeal \u00b7 TEST WEBHOOK",
      icon_url: DISCORD_FOOTER_ICON_URL,
    });
  });

  test("does not send webhook username overrides", async () => {
    const originalFetch = globalThis.fetch;
    let body = "";
    globalThis.fetch = (async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    try {
      await sendDiscordWebhook(FAKE_DISCORD_WEBHOOK_URL, {
        username: "RoAppeal",
        content: "hello",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(JSON.parse(body)).toEqual({ content: "hello" });
  });
});
