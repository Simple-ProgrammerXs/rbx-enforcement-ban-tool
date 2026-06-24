import type { AccountConfig } from "../types";
import { Logger } from "./logger";
import { imapHostForEmail } from "./emailProviders";

const OTP_SENDER = "accounts@roblox.com";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 12; // 60 seconds total

// Bug #1 fix: subject pattern to guard against false-positive body matches
const OTP_SUBJECT_RE = /^(\d{6})\s+is\s+your\s+roblox\s+one-time\s+code/i;

/**
 * Parses the raw RFC-2822 `Subject:` header value out of a raw email source.
 * imapflow's `source` buffer contains the full message including headers.
 */
function parseSubjectFromRaw(raw: string): string {
  // Headers end at the first blank line (\r\n\r\n or \n\n).
  const headerSection = raw.split(/\r?\n\r?\n/)[0] ?? "";

  // A header field can be folded across multiple lines (continuation lines
  // start with whitespace).  Unfold first, then search.
  const unfolded = headerSection.replace(/\r?\n([ \t])/g, " $1");

  for (const line of unfolded.split(/\r?\n/)) {
    if (/^subject\s*:/i.test(line)) {
      // Everything after the colon (and optional whitespace) is the value.
      return line.replace(/^subject\s*:\s*/i, "").trim();
    }
  }

  return "";
}

/**
 * Waits for a Roblox OTP email to arrive in the inbox and extracts the 6-digit code.
 * Polls the INBOX via IMAP for up to 60 seconds.
 *
 * Bug #3 fix: opens a single IMAP connection for all polls instead of one per poll.
 * Bug #4 fix: uses a generous 60-second buffer so emails arriving within the
 *             search window are never incorrectly filtered out.
 *
 * @param account    - The account whose inbox to check.
 * @param sentAfterMs - Only consider emails received after this timestamp (ms).
 * @returns The 6-digit OTP string, or null if not found within the timeout.
 */
export async function fetchOtpCode(
  account: AccountConfig,
  sentAfterMs: number,
): Promise<string | null> {
  const { ImapFlow } = await import("imapflow");
  const host = account.imap_server ?? imapHostForEmail(account.email) ?? "imap.gmail.com";

  // Bug #3: create one client for the entire polling session
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
      for (let poll = 0; poll < MAX_POLLS; poll += 1) {
        if (poll > 0) {
          await sleep(POLL_INTERVAL_MS);
        }

        try {
          const since = new Date(sentAfterMs - 10_000); // small buffer for IMAP search
          const results = await client.search({ since, from: OTP_SENDER });

          if (results === false || results.length === 0) {
            continue;
          }

          // Fetch the most recent matching messages
          const seqNums = [...results].sort((a, b) => b - a).slice(0, 5);

          for await (const message of client.fetch(seqNums, {
            source: true,
            internalDate: true,
          })) {
            const internalDate = message.internalDate;
            const emailMs =
              internalDate instanceof Date
                ? internalDate.getTime()
                : typeof internalDate === "string"
                  ? new Date(internalDate).getTime()
                  : 0;

            // Bug #4 fix: generous 60-second window so emails inside the IMAP
            // `since` buffer aren't immediately discarded by a tighter filter.
            if (emailMs < sentAfterMs - 60_000) {
              continue;
            }

            const raw = message.source?.toString("utf8") ?? "";

            // Bug #1 fix: validate Subject header before extracting the code.
            // This prevents false matches on ticket numbers, dates, etc. in
            // the email body.  The OTP is in the subject itself, so we also
            // pull the code from there instead of from the raw body.
            const subject = parseSubjectFromRaw(raw);
            const subjectMatch = OTP_SUBJECT_RE.exec(subject);
            if (subjectMatch) {
              return subjectMatch[1]!;
            }
          }
        } catch (pollError) {
          const msg = pollError instanceof Error ? pollError.message : "Unknown IMAP error";
          Logger.warning(`${account.username}: OTP poll ${poll + 1} failed - ${msg}`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (connectError) {
    const msg = connectError instanceof Error ? connectError.message : "Unknown IMAP error";
    Logger.warning(`${account.username}: OTP IMAP connect failed - ${msg}`);
  } finally {
    // Bug #3: single logout at the end of all polls
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
