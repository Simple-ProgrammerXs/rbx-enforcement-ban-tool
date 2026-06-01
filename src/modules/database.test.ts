import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FAKE_DISCORD_WEBHOOK_URL = [
  "https://discord.com/api",
  "webhooks",
  "123456789012345678",
  "abcdefghijklmnopqrstuvwxyz_ABC-123",
].join("/");

async function loadDatabaseModule() {
  const tempRoot = await mkdtemp(join(tmpdir(), "appeal-tool-db-"));
  process.env.TEST_PROJECT_ROOT = tempRoot;
  delete process.env.DATA_DIR;
  return import(`./database.ts?test=${crypto.randomUUID()}`);
}

async function loadDatabaseModuleWithDataDir() {
  const dataDir = await mkdtemp(join(tmpdir(), "appeal-tool-data-dir-"));
  delete process.env.TEST_PROJECT_ROOT;
  process.env.DATA_DIR = dataDir;
  return {
    dataDir,
    database: await import(`./database.ts?test=${crypto.randomUUID()}`),
  };
}

describe("database", () => {
  test("stores submissions and updates response status", async () => {
    const database = await loadDatabaseModule();
    const submittedAt = 1_700_000_000_000;

    const record = database.addSubmission("ExampleUser", "user@example.com", submittedAt);
    expect(record.id).toBeGreaterThan(0);
    expect(database.getAccountStatus("exampleuser")).toBe("submitted");

    const recorded = database.recordResponse(
      "ExampleUser",
      "message-1",
      "approved",
      "Appeal approved",
      submittedAt + 60_000,
    );

    expect(recorded).toBe(true);
    expect(database.getAccountStatus("EXAMPLEUSER")).toBe("approved");
    expect(database.getAppealsForAccount("exampleuser")[0]?.responseMessageId).toBe("message-1");
  });

  test("does not apply the same response message twice", async () => {
    const database = await loadDatabaseModule();
    const submittedAt = 1_700_000_000_000;

    database.addSubmission("ExampleUser", "user@example.com", submittedAt);

    expect(
      database.recordResponse("ExampleUser", "message-1", "rejected", "Denied", submittedAt + 1),
    ).toBe(true);
    expect(
      database.recordResponse("ExampleUser", "message-1", "approved", "Approved", submittedAt + 2),
    ).toBe(false);
    expect(database.getAccountStatus("ExampleUser")).toBe("rejected");
  });

  test("does not apply the same support ticket to multiple accounts", async () => {
    const database = await loadDatabaseModule();
    const submittedAt = 1_700_000_000_000;

    database.addSubmission("FirstUser", "shared@example.com", submittedAt);
    database.addSubmission("SecondUser", "shared@example.com", submittedAt + 60_000);

    expect(
      database.recordHumanTicket(
        "FirstUser",
        "message-1",
        "Roblox Support Ticket 171470673",
        submittedAt + 120_000,
      ),
    ).toBe(true);
    expect(
      database.recordHumanTicket(
        "SecondUser",
        "message-2",
        "Re: Roblox Support Ticket 171470673",
        submittedAt + 180_000,
      ),
    ).toBe(false);

    expect(database.getAccountStatus("FirstUser")).toBe("escalated");
    expect(database.getAccountStatus("SecondUser")).toBe("submitted");
  });

  test("finds the latest submission for a shared email inbox", async () => {
    const database = await loadDatabaseModule();

    database.addSubmission("FirstUser", "User@Example.com", 1_700_000_000_000);
    database.addSubmission("SecondUser", "user@example.com", 1_700_000_060_000);

    const latest = database.getLatestSubmissionForEmail("USER@example.com");
    expect(latest?.username).toBe("SecondUser");
    expect(latest?.submittedAt).toBe(1_700_000_060_000);
  });

  test("attaches submitted confirmation emails to nearby local submissions", async () => {
    const database = await loadDatabaseModule();
    const emailDate = 1_700_000_000_000;
    const submittedAt = emailDate + 10_000;
    const body =
      "Hi MileyMINZER,\n\nThis message confirms your appeal request for: creating or using an account to avoid an enforcement action taken against another account.\n\nThe Roblox Team";
    const html = `<p>Hi MileyMINZER,</p><p>This message confirms your appeal request for: creating or using an account to avoid an enforcement action taken against another account.</p><p>The Roblox Team</p>`;

    database.addSubmission(
      "MileyMINZER",
      "user@example.com",
      submittedAt,
      false,
      "Hey, I'm appealing the moderation action on my account, MileyMINZER.",
    );

    expect(
      database.recordSubmittedConfirmation(
        "MileyMINZER",
        "submitted-message-1",
        "Your appeal is submitted",
        emailDate,
        body,
        html,
      ),
    ).toBe(true);

    const appeals = database.getAppealsForAccount("MileyMINZER");
    expect(appeals).toHaveLength(1);
    expect(appeals[0]?.responseStatus).toBe("submitted");
    expect(appeals[0]?.responseBody).toBe(body);
    expect(appeals[0]?.responseHtml).toBe(html);
  });

  test("attaches support tickets to the newest pending submission for a shared email", async () => {
    const database = await loadDatabaseModule();
    const firstSubmittedAt = 1_700_000_000_000;
    const secondSubmittedAt = firstSubmittedAt + 5 * 60_000;
    const ticketDate = secondSubmittedAt + 60_000;

    database.addSubmission("MileyMINZER", "shared@example.com", firstSubmittedAt);
    database.addSubmission("CorrectUser", "shared@example.com", secondSubmittedAt);

    expect(
      database.recordHumanTicketForEmail(
        "shared@example.com",
        "support-ticket-1",
        "Roblox Support Ticket 171470673",
        ticketDate,
      ),
    ).toBe(true);

    expect(database.getAccountStatus("MileyMINZER")).toBe("submitted");
    expect(database.getAccountStatus("CorrectUser")).toBe("escalated");
    expect(database.getAppealsForAccount("CorrectUser")[0]?.responseMessageId).toBe(
      "support-ticket-1",
    );
  });

  test("attaches support tickets without requiring a submitted confirmation first", async () => {
    const database = await loadDatabaseModule();
    const submittedAt = 1_700_000_000_000;

    database.addSubmission("NoConfirmationUser", "user@example.com", submittedAt);

    expect(
      database.recordHumanTicketForEmail(
        "user@example.com",
        "support-ticket-1",
        "Roblox Support Ticket 171470673",
        submittedAt + 60_000,
      ),
    ).toBe(true);
    expect(database.getAccountStatus("NoConfirmationUser")).toBe("escalated");
  });

  test("fills missing response content when an existing message is seen again", async () => {
    const database = await loadDatabaseModule();
    const submittedAt = 1_700_000_000_000;

    database.addSubmission("ExistingTicketUser", "user@example.com", submittedAt);
    database.recordHumanTicketForEmail(
      "user@example.com",
      "support-ticket-1",
      "Roblox Support Ticket 171470673",
      submittedAt + 60_000,
    );

    expect(
      database.recordHumanTicketForEmail(
        "user@example.com",
        "support-ticket-1",
        "Roblox Support Ticket 171470673",
        submittedAt + 60_000,
        "Support ticket body",
        "<p>Support ticket body</p>",
      ),
    ).toBe(false);

    const appeal = database.getAppealsForAccount("ExistingTicketUser")[0];
    expect(appeal?.responseBody).toBe("Support ticket body");
    expect(appeal?.responseHtml).toBe("<p>Support ticket body</p>");
  });

  test("persists the dashboard webhook override", async () => {
    const database = await loadDatabaseModule();

    expect(database.loadSavedDashboardWebhookUrl()).toBeUndefined();

    database.saveDashboardWebhookUrl(FAKE_DISCORD_WEBHOOK_URL);

    expect(database.loadSavedDashboardWebhookUrl()).toBe(FAKE_DISCORD_WEBHOOK_URL);

    database.saveDashboardWebhookUrl("");
    expect(database.loadSavedDashboardWebhookUrl()).toBe("");
  });

  test("stores the SQLite file in DATA_DIR when configured", async () => {
    const { dataDir, database } = await loadDatabaseModuleWithDataDir();

    database.addSubmission("ExampleUser", "user@example.com");
    delete process.env.DATA_DIR;

    expect(existsSync(join(dataDir, "appeals.sqlite"))).toBe(true);
  });
});
