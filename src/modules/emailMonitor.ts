import type { AccountConfig } from "../types";
import { Logger } from "./logger";
import {
  addSubmission,
  recordResponse,
  recordHumanTicket,
  recordSubmittedConfirmation,
  getAppealsForAccount,
} from "./database";
import { imapHostForEmail } from "./emailProviders";

type RobloxResponseStatus = "unknown" | "submitted" | "rejected" | "approved" | "escalated";

function normalizeForMatching(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

function containsAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function extractGreetingUsername(body: string): string | null {
  const match = body.match(/\bhi\s+([a-z0-9_]+)\s*,/iu);
  return match ? match[1]!.toLowerCase() : null;
}

function emailMatchesAccount(
  subject: string,
  body: string,
  recipients: string[],
  account: AccountConfig,
  allowRecipientMatch: boolean,
): boolean {
  const normalizedUsername = normalizeForMatching(account.username);
  const normalizedAccountEmail = account.email.trim().toLowerCase();

  if (
    normalizeForMatching(subject).includes(normalizedUsername) ||
    normalizeForMatching(body).includes(normalizedUsername)
  ) {
    return true;
  }

  if (
    allowRecipientMatch &&
    normalizedAccountEmail.length > 0 &&
    (subject.toLowerCase().includes(normalizedAccountEmail) ||
      body.toLowerCase().includes(normalizedAccountEmail))
  ) {
    return true;
  }

  if (
    allowRecipientMatch &&
    recipients.some((recipient) => recipient.toLowerCase() === normalizedAccountEmail)
  ) {
    const greetingUser = extractGreetingUsername(body);
    if (greetingUser && greetingUser !== normalizedUsername) {
      return false;
    }
    return true;
  }

  return false;
}

function splitHeaderBody(raw: string): { headers: string; body: string } {
  const match = raw.match(/\r?\n\r?\n/u);
  if (!match) {
    return { headers: "", body: raw };
  }

  const index = raw.indexOf(match[0]);
  return {
    headers: raw.slice(0, index),
    body: raw.slice(index + match[0].length),
  };
}

function getHeader(headers: string, name: string): string {
  const regex = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t]+.+)*)`, "imu");
  const match = headers.match(regex);
  return match ? match[1]!.replace(/\r?\n[ \t]+/gu, " ").trim() : "";
}

function decodeQuotedPrintable(text: string): string {
  const cleaned = text.replace(/=\r?\n/gu, "");
  const bytes: number[] = [];

  for (let index = 0; index < cleaned.length; index += 1) {
    if (cleaned[index] === "=" && /^[A-Fa-f0-9]{2}$/u.test(cleaned.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(cleaned.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }

    const chunk = Buffer.from(cleaned[index]!, "utf8");
    bytes.push(...chunk);
  }

  return Buffer.from(bytes).toString("utf8");
}

function decodePart(body: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase().trim();

  if (enc === "base64") {
    const cleaned = body.replace(/[\r\n\s]/gu, "");
    const buf = Buffer.from(cleaned, "base64");
    if (charset && charset !== "utf-8" && charset !== "utf8") {
      try {
        const decoder = new TextDecoder(charset);
        return decoder.decode(buf);
      } catch {
        return buf.toString("utf8");
      }
    }
    return buf.toString("utf8");
  }

  if (enc === "quoted-printable") {
    const decoded = decodeQuotedPrintable(body);
    if (charset && charset !== "utf-8" && charset !== "utf8") {
      try {
        const decoder = new TextDecoder(charset);
        return decoder.decode(Buffer.from(decoded, "binary"));
      } catch {
        return decoded;
      }
    }
    return decoded;
  }

  return body;
}

function extractCharset(contentType: string): string {
  const match = contentType.match(/charset\s*=\s*"?([^";]+)"?/iu);
  return match ? match[1]!.trim().toLowerCase() : "utf-8";
}

function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary\s*=\s*"?([^";]+)"?/iu);
  return match ? match[1]!.trim() : null;
}

type EmailContent = {
  text: string;
  html?: string;
};

type EmailParts = {
  text: string[];
  html: string[];
};

function extractEmailParts(rawSource: string): EmailParts {
  const { headers, body } = splitHeaderBody(rawSource);
  const contentType = getHeader(headers, "Content-Type") || "text/plain";
  const encoding = getHeader(headers, "Content-Transfer-Encoding") || "7bit";
  const charset = extractCharset(contentType);
  const contentTypeLower = contentType.toLowerCase();

  if (contentTypeLower.startsWith("multipart/")) {
    const boundary = extractBoundary(contentType);
    if (!boundary) {
      return { text: [decodePart(body, encoding, charset)], html: [] };
    }

    const parts = body.split(`--${boundary}`);
    const collected: EmailParts = { text: [], html: [] };

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed === "--" || trimmed === "" || trimmed.startsWith("--")) {
        continue;
      }

      const extracted = extractEmailParts(trimmed);
      collected.text.push(...extracted.text);
      collected.html.push(...extracted.html);
    }

    return collected;
  }

  const decoded = decodePart(body, encoding, charset);

  if (contentTypeLower.includes("text/html")) {
    return { text: [], html: [decoded] };
  }

  if (contentTypeLower.includes("text/plain") || contentTypeLower.includes("text/")) {
    return { text: [decoded], html: [] };
  }

  return { text: [], html: [] };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/giu, "\n")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/[ \t\f\v]+/gu, " ")
    .replace(/ *\n+ */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function cleanEmailContent(rawSource: string): EmailContent {
  const parts = extractEmailParts(rawSource);
  const text = parts.text.join("\n\n").trim();
  const html = parts.html.join("\n").trim();

  return {
    text: text || stripHtml(html),
    ...(html ? { html } : {}),
  };
}

const APPROVED_TERMS = {
  subjectLatin: [
    "approved",
    "restored",
    "reinstated",
    "approuve",
    "appel approuve",
    "genehmigt",
    "wiederherstell",
    "aprobad",
    "restaurad",
    "aprovad",
    "approvat",
    "onaylandi",
    "zatwierdzon",
    "goedgekeurd",
    "disetujui",
    "chap thuan",
  ],
  subjectUnicode: [
    "\u043e\u0434\u043e\u0431\u0440\u0435\u043d",
    "\u627f\u8a8d",
    "\uc2b9\uc778",
    "\u6279\u51c6",
    "\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34",
    "\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629",
  ],
  bodyLatin: [
    "your account has been restored",
    "your appeal has been approved",
    "your appeal is approved",
    "appeal has been approved",
    "account has been unbanned",
    "moderation has been reversed",
    "the moderation has been reversed",
    "compte a ete restaure",
    "moderation a ete annulee",
    "konto wurde wiederhergestellt",
    "moderationsmassnahme wurde ruckgangig",
    "cuenta ha sido restaurada",
    "moderacion ha sido revertida",
    "conta foi restaurada",
    "account e stato ripristinato",
    "moderazione e stata annullata",
    "hesabiniz geri yuklendi",
    "konto zostalo przywrocone",
    "account is hersteld",
    "akun telah dipulihkan",
    "tai khoan da duoc khoi phuc",
  ],
  bodyUnicode: [
    "\u0430\u043a\u043a\u0430\u0443\u043d\u0442 \u0431\u044b\u043b \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d",
    "\u043c\u043e\u0434\u0435\u0440\u0430\u0446\u0438\u044f \u0431\u044b\u043b\u0430 \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u0430",
    "\u30a2\u30ab\u30a6\u30f3\u30c8\u304c\u5fa9\u5143",
    "\u51e6\u5206\u304c\u53d6\u6d88",
    "\uacc4\uc815\uc774 \ubcf5\uc6d0",
    "\u5e10\u6237\u5df2\u6062\u590d",
    "\u8d26\u53f7\u5df2\u6062\u590d",
    "\u5904\u7f5a\u5df2\u64a4\u9500",
    "\u7533\u8bc9\u5df2\u901a\u8fc7",
    "\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e01\u0e39\u0e49\u0e04\u0e37\u0e19",
    "\u062a\u0645\u062a \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u062d\u0633\u0627\u0628\u0643",
  ],
};

const REJECTED_TERMS = {
  subjectLatin: [
    "rejected",
    "denied",
    "rejete",
    "rejet",
    "refuse",
    "rechaz",
    "denegad",
    "abgelehnt",
    "verweigert",
    "rejeitad",
    "negad",
    "rifiutat",
    "respint",
    "afgewezen",
    "reddedildi",
    "odrzucon",
    "ditolak",
    "tu choi",
  ],
  subjectUnicode: [
    "\u043e\u0442\u043a\u043b\u043e\u043d\u0435\u043d",
    "\u5374\u4e0b",
    "\uac70\ubd80",
    "\u62d2\u7edd",
    "\u62d2\u7d76",
    "\u0e1b\u0e0f\u0e34\u0e40\u0e2a\u0e18",
    "\u0627\u0644\u0631\u0641\u0636",
  ],
  bodyLatin: [
    "appeal is rejected",
    "appeal has been rejected",
    "appeal has been denied",
    "still violates",
    "this action still violates",
    "moderation action will stand",
    "enfreint toujours",
    "viole toujours",
    "verstosst weiterhin",
    "sigue infringiendo",
    "sigue violando",
    "ainda viola",
    "ainda infringe",
    "viola ancora",
    "hala ihlal",
    "nadal narusza",
    "nog steeds in strijd",
    "masih melanggar",
    "van vi pham",
  ],
  bodyUnicode: [
    "\u043f\u043e-\u043f\u0440\u0435\u0436\u043d\u0435\u043c\u0443 \u043d\u0430\u0440\u0443\u0448\u0430\u0435\u0442",
    "\u0432\u0441\u0451 \u0435\u0449\u0451 \u043d\u0430\u0440\u0443\u0448\u0430\u0435\u0442",
    "\u9055\u53cd\u3057\u3066\u3044\u307e\u3059",
    "\uc5ec\uc804\ud788 \uc704\ubc18",
    "\u4f9d\u65e7\u8fdd\u53cd",
    "\u4ecd\u7136\u8fdd\u53cd",
    "\u4ecd\u9055\u53cd",
    "\u0e22\u0e31\u0e07\u0e04\u0e07\u0e25\u0e30\u0e40\u0e21\u0e34\u0e14",
    "\u0644\u0627 \u064a\u0632\u0627\u0644 \u064a\u0646\u062a\u0647\u0643",
    "\u0644\u0627 \u062a\u0632\u0627\u0644 \u062a\u0646\u062a\u0647\u0643",
  ],
};

const SUBMITTED_TERMS = {
  subjectLatin: [
    "appeal is submitted",
    "appeal request for",
    "confirms your appeal",
    "se envio tu apelacion",
    "dein widerspruch wurde eingereicht",
    "ta demande en appel a ete soumise",
    "il tuo appello e stato inviato",
    "seu apelo foi enviado",
    "seu recurso foi",
    "apelacao foi enviada",
    "itiraziniz alindi",
    "odwolanie zostalo",
    "beroep is ingediend",
    "banding diterima",
    "khang cao da duoc gui",
  ],
  subjectUnicode: [
    "\u0430\u043f\u0435\u043b\u043b\u044f\u0446\u0438\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430",
    "\u7533\u3057\u7acb\u3066\u3092\u53d7\u4ed8",
    "\uc774\uc758 \uc2e0\uccad\uc774 \uc811\uc218",
    "\u7533\u8bc9\u5df2\u63d0\u4ea4",
    "\u7533\u8a34\u5df2\u63d0\u4ea4",
    "\u0e01\u0e32\u0e23\u0e2d\u0e38\u0e17\u0e18\u0e23\u0e13\u0e4c\u0e16\u0e39\u0e01\u0e2a\u0e48\u0e07",
    "\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0627\u0633\u062a\u0626\u0646\u0627\u0641\u0643",
  ],
  bodyLatin: [
    "received your appeal",
    "we have received your appeal",
    "thank you for submitting your appeal",
    "message confirms your appeal",
    "message confirms your appe",
    "recu votre appel",
    "nous avons recu",
    "widerspruch erhalten",
    "hemos recibido tu apelacion",
    "recibido tu apelacion",
    "esta mensagem confirma o seu pedido de apelo",
    "recebemos seu recurso",
    "nossa equipe de moderacao ira analisar se a sua conta segue as regras da comunidade roblox",
    "conferma la tua richiesta di appello",
    "ricevuto il tuo appello",
    "itirazinizi aldik",
    "otrzymalismy twoje odwolanie",
    "beroep ontvangen",
    "banding anda telah diterima",
    "da nhan duoc khang cao",
  ],
  bodyUnicode: [
    "\u043f\u043e\u043b\u0443\u0447\u0438\u043b\u0438 \u0432\u0430\u0448\u0443 \u0430\u043f\u0435\u043b\u043b\u044f\u0446\u0438\u044e",
    "\u7570\u8b70\u7533\u3057\u7acb\u3066\u3092\u53d7\u3051\u4ed8\u3051\u307e\u3057\u305f",
    "\uc774\uc758 \uc2e0\uccad\uc744 \uc811\uc218",
    "\u5df2\u6536\u5230\u4f60\u7684\u7533\u8bc9",
    "\u5df2\u6536\u5230\u60a8\u7684\u7533\u8bc9",
    "\u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e01\u0e32\u0e23\u0e2d\u0e38\u0e17\u0e18\u0e23\u0e13\u0e4c",
    "\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0637\u0639\u0646\u0643",
  ],
};
export function parseRobloxResponse(
  subject: string,
  body: string,
  fromAddress?: string,
): RobloxResponseStatus {
  const normalizedSubject = normalizeForMatching(subject);
  const normalizedBody = normalizeForMatching(body);
  const rawSubject = subject.toLowerCase();
  const rawBody = body.toLowerCase();
  const from = fromAddress?.toLowerCase();

  if (
    containsAny(normalizedSubject, APPROVED_TERMS.subjectLatin) ||
    containsAny(rawSubject, APPROVED_TERMS.subjectUnicode) ||
    containsAny(normalizedBody, APPROVED_TERMS.bodyLatin) ||
    containsAny(rawBody, APPROVED_TERMS.bodyUnicode)
  ) {
    return "approved";
  }

  if (normalizedSubject.includes("let us know how we did")) {
    return "unknown";
  }

  if (normalizedSubject.includes("roblox support ticket")) {
    return "escalated";
  }

  if (from === "support-en@roblox.com") {
    return "escalated";
  }

  if (
    containsAny(normalizedSubject, REJECTED_TERMS.subjectLatin) ||
    containsAny(rawSubject, REJECTED_TERMS.subjectUnicode) ||
    containsAny(normalizedBody, REJECTED_TERMS.bodyLatin) ||
    containsAny(rawBody, REJECTED_TERMS.bodyUnicode)
  ) {
    return "rejected";
  }

  if (
    containsAny(normalizedSubject, SUBMITTED_TERMS.subjectLatin) ||
    containsAny(rawSubject, SUBMITTED_TERMS.subjectUnicode) ||
    containsAny(normalizedBody, SUBMITTED_TERMS.bodyLatin) ||
    containsAny(rawBody, SUBMITTED_TERMS.bodyUnicode)
  ) {
    return "submitted";
  }

  return "unknown";
}

export async function checkForNewResponses(
  account: AccountConfig,
  sinceMs: number,
  allowRecipientMatch: boolean,
): Promise<{ imapFailed: boolean }> {
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

  // ImapFlow is an EventEmitter: an 'error' event with no listener (e.g. the
  // socket drops between cycles) is an uncaught exception that crashes the
  // process. Attaching a listener turns it into a logged, non-fatal warning.
  client.on("error", (error: Error) => {
    Logger.warning(`${account.username}: IMAP connection error - ${error.message}`);
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const since = new Date(sinceMs);
      const senders = ["no-reply@roblox.com", "support-en@roblox.com"];
      const seqNums = new Set<number>();

      for (const sender of senders) {
        const results = await client.search({ since, from: sender });
        if (results === false) {
          continue;
        }

        for (const num of results) {
          seqNums.add(num);
        }
      }

      if (seqNums.size === 0) {
        return { imapFailed: false };
      }

      type MatchedEmail = {
        messageId: string;
        status: "submitted" | "rejected" | "approved" | "escalated";
        subject: string;
        emailDate: number;
        isHumanTicket: boolean;
        body?: string;
        html?: string;
      };
      const matched: MatchedEmail[] = [];

      for await (const message of client.fetch([...seqNums], {
        envelope: true,
        source: true,
        internalDate: true,
      })) {
        const subject = message.envelope?.subject || "";
        const messageId = message.envelope?.messageId || "";
        if (!messageId) {
          continue;
        }

        const recipients = [
          ...(message.envelope?.to?.map((entry) => entry.address || "") || []),
          ...(message.envelope?.cc?.map((entry) => entry.address || "") || []),
        ].filter(Boolean);
        const fromAddress =
          message.envelope?.from
            ?.map((entry) => entry.address?.toLowerCase())
            .find((address): address is string => Boolean(address)) || "";

        const internalDate = message.internalDate;
        const emailDate =
          internalDate instanceof Date
            ? internalDate.getTime()
            : typeof internalDate === "string"
              ? new Date(internalDate).getTime()
              : 0;

        const rawSource = message.source?.toString("utf8") || "";
        const emailContent = cleanEmailContent(rawSource);
        const body = emailContent.text;

        if (fromAddress === "support-en@roblox.com") {
          const parsed = parseRobloxResponse(subject, body, fromAddress);
          if (
            parsed === "escalated" &&
            emailMatchesAccount(subject, body, recipients, account, allowRecipientMatch)
          ) {
            matched.push({
              messageId,
              status: "escalated",
              subject,
              emailDate,
              isHumanTicket: true,
              body,
              html: emailContent.html,
            });
          }
          continue;
        }

        if (!emailMatchesAccount(subject, body, recipients, account, allowRecipientMatch)) {
          continue;
        }

        const parsed = parseRobloxResponse(subject, body, fromAddress);
        if (parsed !== "unknown") {
          matched.push({
            messageId,
            status: parsed,
            subject,
            emailDate,
            isHumanTicket: false,
            body,
            html: emailContent.html,
          });
        }
      }

      matched.sort((a, b) => a.emailDate - b.emailDate);

      for (const email of matched) {
        if (email.status === "submitted") {
          const existing = getAppealsForAccount(account.username);
          if (existing.some((a) => a.responseMessageId === email.messageId)) {
            continue;
          }

          if (
            recordSubmittedConfirmation(
              account.username,
              email.messageId,
              email.subject,
              email.emailDate,
              email.body,
              email.html,
            )
          ) {
            continue;
          }

          const hasNearbySubmission = existing.some(
            (a) => Math.abs(a.submittedAt - email.emailDate) < 120_000,
          );
          if (!hasNearbySubmission) {
            addSubmission(account.username, account.email, email.emailDate, true);
            recordSubmittedConfirmation(
              account.username,
              email.messageId,
              email.subject,
              email.emailDate,
              email.body,
              email.html,
            );
          }
        } else if (email.isHumanTicket) {
          recordHumanTicket(
            account.username,
            email.messageId,
            email.subject,
            email.emailDate,
            email.body,
            email.html,
          );
        } else {
          recordResponse(
            account.username,
            email.messageId,
            email.status,
            email.subject,
            email.emailDate,
            email.body,
            email.html,
          );
        }
      }

      return { imapFailed: false };
    } finally {
      lock.release();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown IMAP error";
    Logger.error(`${account.username}: IMAP check failed - ${msg}`);
    return { imapFailed: true };
  } finally {
    try {
      await client.logout();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown logout error";
      Logger.warning(`${account.username}: IMAP logout failed - ${message}`);
    }
  }
}
