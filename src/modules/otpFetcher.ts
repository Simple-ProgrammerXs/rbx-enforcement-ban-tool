import type { AccountConfig } from "../types";
import { Logger } from "./logger";
import { imapHostForEmail } from "./emailProviders";

const OTP_SENDER = "accounts@roblox.com";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 12; // 60 seconds total

/**
 * Waits for a Roblox OTP email to arrive in the inbox and extracts the 6-digit code.
 * Polls the INBOX via IMAP for up to 60 seconds.
 *
 * @param account - The account whose inbox to check.
 * @param sentAfterMs - Only consider emails received after this timestamp (ms).
 * @returns The 6-digit OTP string, or null if not found within the timeout.
 */
export async function fetchOtpCode(
  account: AccountConfig,
  sentAfterMs: number,
): Promise<string | null> {
  const { ImapFlow } = await import("imapflow");
  const host = account.imap_server ?? imapHostForEmail(account.email) ?? "imap.gmail.com";

  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    if (poll > 0) {
      await sleep(POLL_INTERVAL_MS);
    }

    const client = new ImapFlow({
      host,
      port: account.imap_port ?? 993,
      secure: (account.imap_port ?? 993) === 993,
      logger: false,
      auth: {
        user: account.email,
        pass: account.app_password,
      },
    });

    client.on("error", (error: Error) => {
      Logger.warning(`${account.username}: OTP IMAP error - ${error.message}`);
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        const since = new Date(sentAfterMs - 10_000); // small buffer
        const results = await client.search({ since, from: OTP_SENDER });

        if (results === false || results.length === 0) {
          continue;
        }

        // Fetch the most recent matching message
        const seqNums = [...results].sort((a, b) => b - a).slice(0, 5);

        for await (const message of client.fetch(seqNums, { source: true, internalDate: true })) {
          const internalDate = message.internalDate;
          const emailMs =
            internalDate instanceof Date
              ? internalDate.getTime()
              : typeof internalDate === "string"
                ? new Date(internalDate).getTime()
                : 0;

          if (emailMs < sentAfterMs - 30_000) {
            continue;
          }

          const raw = message.source?.toString("utf8") || "";
          const match = raw.match(/\b([0-9]{6})\b/u);
          if (match) {
            return match[1]!;
          }
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown IMAP error";
      Logger.warning(`${account.username}: OTP poll ${poll + 1} failed - ${msg}`);
    } finally {
      try {
        await client.logout();
      } catch {
        // ignore logout errors
      }
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
