import type { AccountConfig } from "../types";
import { Logger } from "./logger";
import { imapHostForEmail } from "./emailProviders";

const OTP_SENDER = "accounts@roblox.com";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 12; // 60 seconds total

// Primary match: "937117 Is Your Roblox One-Time Code"
// Anchored with $ so it won't match unrelated subjects.
const OTP_SUBJECT_STRICT_RE = /^(\d{6})\s+is\s+your\s+roblox\s+one-time\s+code$/i;

// Loose match used only to gate the body fallback — confirms it is a Roblox
// OTP email even if Roblox tweaks the exact subject wording slightly.
const OTP_SUBJECT_LOOSE_RE = /roblox\s+one-time\s+code/i;

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
      return line.replace(/^subject\s*:\s*/i, "").trim();
    }
  }

  return "";
}

/**
 * Extracts a 6-digit OTP code from a raw RFC-2822 email message.
 *
 * Strategy (in order):
 *  1. Strict subject match — "XXXXXX Is Your Roblox One-Time Code"
 *     The code is captured directly from the subject (confirmed by real email).
 *  2. Body fallback — only triggered when the subject loosely matches Roblox's
 *     OTP pattern but the strict regex didn't capture a code (e.g. Roblox
 *     tweaks the subject wording).  Extracts the first 6-digit sequence from
 *     the message body, which also contains the code in bold.
 *
 * Returns null if neither strategy finds a code.
 */
function extractOtpFromMessage(raw: string): string | null {
  const subject = parseSubjectFromRaw(raw).trim();

  // Strategy 1: strict subject match — fastest and most reliable path.
  const strictMatch = OTP_SUBJECT_STRICT_RE.exec(subject);
  if (strictMatch) {
    return strictMatch[1]!;
  }

  // Strategy 2: body fallback — only if the subject still looks like a Roblox
  // OTP email so we don't accidentally pull a 6-digit number from an unrelated
  // message that also happens to be from accounts@roblox.com.
  if (OTP_SUBJECT_LOOSE_RE.test(subject)) {
    // Strip headers (everything before the first blank line) so we only search
    // the message body, reducing the chance of matching a ticket/date number
    // that might appear in the header section.
    const bodyStart = raw.search(/\r?\n\r?\n/);
    const body = bodyStart >= 0 ? raw.slice(bodyStart) : raw;
    const bodyMatch = body.match(/\b(\d{6})\b/);
    if (bodyMatch) {
      return bodyMatch[1]!;
    }
  }

  return null;
}

/**
 * Waits for a Roblox OTP email to arrive in the inbox and extracts the 6-digit code.
 * Polls the INBOX via IMAP for up to 60 seconds using a single connection.
 *
 * @param account     - The account whose inbox to check.
 * @param sentAfterMs - Only consider emails received after this timestamp (ms).
 * @returns The 6-digit OTP string, or null if not found within the timeout.
 */
export async function fetchOtpCode(
  account: AccountConfig,
  sentAfterMs: number,
): Promise<string | null> {
  const { ImapFlow } = await import("imapflow");
  const host = account.imap_server ?? imapHostForEmail(account.email) ?? "imap.gmail.com";

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
          const since = new Date(sentAfterMs - 10_000);
          const results = await client.search({ since, from: OTP_SENDER });

          if (results === false || results.length === 0) {
            continue;
          }

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

            // 60-second window so emails inside the IMAP `since` buffer are
            // never incorrectly discarded by a tighter filter.
            if (emailMs < sentAfterMs - 60_000) {
              continue;
            }

            const raw = message.source?.toString("utf8") ?? "";
            const code = extractOtpFromMessage(raw);
            if (code) {
              return code;
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
