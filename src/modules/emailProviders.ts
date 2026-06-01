// Maps common email domains to their IMAP host so accounts work across
// providers (Gmail, Outlook/Microsoft) using an app password, without each user
// having to look up server settings. Unknown domains require an explicit
// `imap_server` in the account config.
//
// Both Gmail and Outlook/Microsoft personal accounts support app passwords for
// IMAP when two-step verification is enabled.
const IMAP_HOST_BY_DOMAIN: Record<string, string> = {
  "gmail.com": "imap.gmail.com",
  "googlemail.com": "imap.gmail.com",
  "outlook.com": "outlook.office365.com",
  "hotmail.com": "outlook.office365.com",
  "live.com": "outlook.office365.com",
  "msn.com": "outlook.office365.com",
  "office365.com": "outlook.office365.com",
};

/** Lowercased domain part of an email address (text after the last `@`). */
export function emailDomain(email: string): string {
  return email.split("@").at(-1)?.trim().toLowerCase() ?? "";
}

/** IMAP host for a known provider domain, or undefined if unrecognized. */
export function imapHostForEmail(email: string): string | undefined {
  return IMAP_HOST_BY_DOMAIN[emailDomain(email)];
}

export function emailProviderLabel(
  email: string,
  imapServer?: string,
): "Gmail" | "Outlook" | "Custom IMAP" {
  const host = (imapServer ?? imapHostForEmail(email) ?? "").toLowerCase();
  if (host.includes("gmail.com")) {
    return "Gmail";
  }

  if (host.includes("office365.com") || host.includes("outlook.com")) {
    return "Outlook";
  }

  return "Custom IMAP";
}

/** Human-readable list of built-in providers, for error/help messages. */
export const SUPPORTED_EMAIL_PROVIDERS = "Gmail, Outlook/Hotmail/Live";
