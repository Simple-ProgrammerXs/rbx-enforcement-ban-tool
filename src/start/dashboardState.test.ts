import { describe, expect, test } from "bun:test";
import { buildSampleHistory, getDashboardState, setDashboardWebhook } from "./dashboardState";

const FAKE_DISCORD_WEBHOOK_URL = [
  "https://discord.com/api",
  "webhooks",
  "123456789012345678",
  "abcdefghijklmnopqrstuvwxyz_ABC-123",
].join("/");

describe("dashboard test-mode sample history", () => {
  test("only uses submitted as the latest pending appeal", () => {
    const history = buildSampleHistory("ExampleUser", "submitted", 1_700_000_000_000, 55);
    const priorAppeals = history.slice(0, -1);

    expect(history.at(-1)?.status).toBe("submitted");
    expect(priorAppeals.every((appeal) => appeal.status !== "submitted")).toBe(true);
  });

  test("does not include pending appeals in completed sample histories", () => {
    const history = buildSampleHistory("ExampleUser", "rejected", 1_700_000_000_000, 12);

    expect(history.some((appeal) => appeal.status === "submitted")).toBe(false);
    expect(history.some((appeal) => appeal.status === "stale")).toBe(true);
    expect(
      history
        .filter((appeal) => appeal.status === "stale")
        .every(
          (appeal) =>
            !appeal.response && appeal.submittedAt <= 1_700_000_000_000 - 49 * 60 * 60 * 1000,
        ),
    ).toBe(true);
  });

  test("exposes the configured Discord webhook URL for the local dashboard", () => {
    setDashboardWebhook(FAKE_DISCORD_WEBHOOK_URL);

    const state = getDashboardState();
    expect(state.discordWebhookUrl).toBe(FAKE_DISCORD_WEBHOOK_URL);
    expect(state.discordWebhookMasked).toBe("https://discord.com/api/webhooks/.../BC-123");
  });
});
