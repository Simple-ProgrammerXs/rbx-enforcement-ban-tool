import { useMemo, useRef, useState } from "react";
import type { AccountDashboardState, AppealEntry } from "../../types";
import { Icon, type IconName } from "./Icon";
import { ENTRY_LABEL, entryStatusClass, statusIconName } from "./status";
import { cx, formatTime } from "./utils";

const PAGE_SIZE = 10;
const ROBLOX_STANDARDS_URL = "https://en.help.roblox.com/hc/articles/203313410";

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function linkifyEmailText(value: string): string {
  return escapeHtml(value).replace(
    /Roblox Community Standards/gu,
    `<a href="${ROBLOX_STANDARDS_URL}" target="_blank" rel="noreferrer">Roblox Community Standards</a>`,
  );
}

function stripOuterEmailDocument(html: string): string {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/iu);
  if (bodyMatch?.[1]) {
    return bodyMatch[1];
  }

  return html
    .replace(/<!doctype[^>]*>/giu, "")
    .replace(/<html\b[^>]*>|<\/html>/giu, "")
    .replace(/<head\b[\s\S]*?<\/head>/giu, "");
}

function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/giu, "")
    .replace(/<object\b[\s\S]*?<\/object>/giu, "")
    .replace(/<embed\b[\s\S]*?<\/embed>/giu, "")
    .replace(/<base\b[^>]*>/giu, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/giu, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/giu, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/giu, "")
    .replace(/\s(href|src)\s*=\s*"javascript:[^"]*"/giu, "")
    .replace(/\s(href|src)\s*=\s*'javascript:[^']*'/giu, "");
}

function renderStoredEmailHtml(html: string): string {
  const sanitized = sanitizeEmailHtml(html);
  const viewportStyle = `<style>
    html, body { margin: 0; min-height: 100%; background: #ffffff !important; color-scheme: light !important; }
    body { color: #393B3D !important; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    .wrapper-background {
      background-color: #ffffff !important;
      background-image: linear-gradient(to bottom, #C7CBCE, #FFFFFF) !important;
    }
    td.bordered-content,
    .bordered-content {
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #393B3D !important;
    }
    .email-header,
    strong {
      color: #393B3D !important;
    }
    .email-body,
    .email-body p,
    .email-footer,
    .zd-comment,
    .zd-comment p,
    .list-text {
      color: #767879 !important;
    }
    .email-body a,
    .email-footer a,
    .email-links a {
      color: #393B3D !important;
      text-decoration: underline !important;
    }
    .letterform-grey {
      filter: invert(0%) sepia(93%) saturate(0%) hue-rotate(234deg) brightness(96%) contrast(107%) !important;
    }
  </style>`;

  if (/<html\b/i.test(sanitized)) {
    let documentHtml = sanitized.replace(
      /<meta\s+name=(["'])color-scheme\1\s+content=(["'])[^"']*\2\s*\/?>/giu,
      `<meta name="color-scheme" content="light">`,
    );
    documentHtml = documentHtml.replace(
      /<meta\s+name=(["'])supported-color-schemes\1\s+content=(["'])[^"']*\2\s*\/?>/giu,
      `<meta name="supported-color-schemes" content="light">`,
    );

    if (/<\/head>/iu.test(documentHtml)) {
      return documentHtml.replace(/<\/head>/iu, `${viewportStyle}</head>`);
    }

    return documentHtml.replace(/<html\b([^>]*)>/iu, `<html$1><head>${viewportStyle}</head>`);
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    ${viewportStyle}
  </head>
  <body>${stripOuterEmailDocument(sanitized)}</body>
</html>`;
}

function textToEmailHtml(text: string): string {
  const formatted = formatEmailText(text);
  const paragraphs = formatted
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.length > 0
    ? paragraphs.map((paragraph) => `<p>${linkifyEmailText(paragraph)}</p>`).join("")
    : `<p>${linkifyEmailText(formatted)}</p>`;
}

function buildEmailFrameSrcDoc({
  date,
  html,
  status,
  subject,
  text,
}: {
  date?: string;
  html?: string;
  status?: AppealEntry["status"];
  subject?: string;
  text: string;
}): string {
  if (html) {
    return renderStoredEmailHtml(html);
  }

  const content = textToEmailHtml(text);
  const senderName = status === "submitted" ? "Roblox no-reply" : "Roblox Support";
  const senderEmail = status === "submitted" ? "no-reply@roblox.com" : "support-en@roblox.com";
  const safeSubject = escapeHtml(subject || "Roblox support message");
  const safeDate = date ? escapeHtml(date) : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: #ffffff; }
      body {
        color: #202124;
        font: 14px/1.5 Arial, Helvetica, sans-serif;
        padding: 20px 42px 32px;
        overflow-wrap: anywhere;
      }
      .subject {
        color: #202124;
        font-size: 22px;
        font-weight: 400;
        line-height: 1.35;
        margin: 0 0 20px;
      }
      .sender {
        align-items: center;
        display: flex;
        gap: 14px;
        margin-bottom: 16px;
      }
      .avatar {
        align-items: center;
        background: #111;
        border-radius: 999px;
        color: #fff;
        display: flex;
        flex: 0 0 40px;
        font-size: 18px;
        font-weight: 700;
        height: 40px;
        justify-content: center;
        line-height: 1;
        width: 40px;
      }
      .sender-main { flex: 1; min-width: 0; }
      .sender-name { font-weight: 700; }
      .sender-email { color: #5f6368; font-weight: 400; margin-left: 6px; }
      .recipient { color: #5f6368; font-size: 13px; margin-top: 1px; }
      .date { color: #5f6368; flex: 0 0 auto; font-size: 13px; white-space: nowrap; }
      .message { padding-left: 44px; }
      p { margin: 0 0 20px; }
      p:last-child { margin-bottom: 0; }
      a { color: #1155cc; text-decoration: underline; }
      img { max-width: 100%; height: auto; }
      table { max-width: 100%; }
      @media (max-width: 640px) {
        body { padding: 18px 18px 28px; }
        .date { display: none; }
        .message { padding-left: 0; }
      }
    </style>
  </head>
  <body>
    <h1 class="subject">${safeSubject}</h1>
    <div class="sender">
      <div class="avatar">R</div>
      <div class="sender-main">
        <div>
          <span class="sender-name">${senderName}</span>
          <span class="sender-email">&lt;${senderEmail}&gt;</span>
        </div>
        <div class="recipient">to me</div>
      </div>
      <div class="date">${safeDate}</div>
    </div>
    <main class="message">${content}</main>
  </body>
</html>`;
}

function formatEmailText(text: string): string {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();
  if (normalized.includes("\n")) {
    return normalized;
  }

  return normalized
    .replace(/^(Hi\s+[a-z0-9_]+,\s+)/iu, "$1\n\n")
    .replace(/\s+(Our moderation team will review whether)/u, "\n\n$1")
    .replace(/\s+(The Roblox Team)$/u, "\n\n$1")
    .replace(/Roblox Community Standards\s+\./gu, "Roblox Community Standards.");
}

export function appealPageCount(account: AccountDashboardState): number {
  return Math.max(0, Math.ceil((account.appealHistory?.length ?? 0) / PAGE_SIZE) - 1);
}

export function AppealsList({
  account,
  entryOpen,
  page,
  setEntryOpen,
  setPage,
}: {
  account: AccountDashboardState;
  entryOpen: Record<string, boolean>;
  page: number;
  setEntryOpen: (key: string, value: boolean) => void;
  setPage: (username: string, page: number) => void;
}) {
  const history = account.appealHistory ?? [];
  if (history.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-white/10 p-4 text-sm text-[#7e7499]">
        No appeals yet.
      </p>
    );
  }

  const counts = history.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    { approved: 0, escalated: 0, rejected: 0, stale: 0, submitted: 0 },
  );
  const total = history.length;
  const ordered = [...history].reverse();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 0), pageCount - 1);
  const pageItems = ordered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="overflow-hidden rounded-lg border border-[#241a3d] bg-[#100a22]/55">
      <AppealsSummary total={total} counts={counts} />
      <div className="divide-y divide-[#241a3d]">
        {pageItems.map((entry, index) => {
          const number = total - (currentPage * PAGE_SIZE + index);
          return (
            <AppealRow
              key={`${account.username}-${number}`}
              account={account}
              entry={entry}
              entryNumber={number}
              isOpen={entryOpen[`${account.username}#${number}`] === true}
              setEntryOpen={setEntryOpen}
            />
          );
        })}
      </div>
      {pageCount > 1 ? (
        <AppealsPager
          account={account}
          currentPage={currentPage}
          pageCount={pageCount}
          setPage={setPage}
        />
      ) : null}
    </div>
  );
}

function AppealsPager({
  account,
  currentPage,
  pageCount,
  setPage,
}: {
  account: AccountDashboardState;
  currentPage: number;
  pageCount: number;
  setPage: (username: string, page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#241a3d] bg-[#140e26] px-4 py-3 text-sm">
      <button
        type="button"
        className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 font-semibold text-[#f4f0fa] transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={currentPage === 0}
        onClick={() => setPage(account.username, currentPage - 1)}
      >
        Previous
      </button>
      <span className="text-[#7e7499]">
        Page {currentPage + 1} of {pageCount}
      </span>
      <button
        type="button"
        className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 font-semibold text-[#f4f0fa] transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={currentPage >= pageCount - 1}
        onClick={() => setPage(account.username, currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
}

function AppealsSummary({
  counts,
  total,
}: {
  counts: Record<AppealEntry["status"], number>;
  total: number;
}) {
  const items = [
    { label: "sent", n: total, className: "text-[#f4f0fa]" },
    counts.approved
      ? { label: "approved", n: counts.approved, className: "text-emerald-300" }
      : undefined,
    counts.submitted
      ? { label: "in review", n: counts.submitted, className: "text-blue-300" }
      : undefined,
    counts.rejected
      ? { label: "rejected", n: counts.rejected, className: "text-red-300" }
      : undefined,
    counts.stale ? { label: "stale", n: counts.stale, className: "text-orange-200" } : undefined,
    counts.escalated
      ? { label: "escalated", n: counts.escalated, className: "text-amber-200" }
      : undefined,
  ].filter((item): item is { label: string; n: number; className: string } => Boolean(item));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#241a3d] bg-[#140e26] px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7e7499]">Appeals</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#7e7499]">
        {items.map((item) => (
          <span key={item.label}>
            <b className={item.className}>{item.n}</b> {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function AppealRow({
  account,
  entry,
  entryNumber,
  isOpen,
  setEntryOpen,
}: {
  account: AccountDashboardState;
  entry: AppealEntry;
  entryNumber: number;
  isOpen: boolean;
  setEntryOpen: (key: string, value: boolean) => void;
}) {
  const when = entry.respondedAt ?? entry.submittedAt;
  const responseText = entry.response ?? entry.responseSubject;
  const responseHtml = entry.responseHtml;
  const responseLabel = entry.status === "submitted" ? "Submitted response" : "Response";
  const hasResponse = Boolean(responseText || responseHtml);
  const hasDetail = Boolean(entry.message || hasResponse);
  const key = `${account.username}#${entryNumber}`;

  return (
    <div className="bg-[#100a22]/70 px-4 py-3 transition hover:bg-white/[0.025]">
      <div className="grid gap-3 lg:grid-cols-[minmax(140px,1fr)_auto_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <strong className="text-sm text-white">Appeal #{entryNumber}</strong>
            <span
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                entryStatusClass(entry.status),
              )}
            >
              <Icon name={statusIconName(entry.status)} size={13} />
              {ENTRY_LABEL[entry.status]}
            </span>
          </div>
        </div>
        <span className="font-mono text-xs text-[#7e7499] lg:text-right">{formatTime(when)}</span>
        <div className="flex justify-start lg:justify-end">
          {hasDetail ? (
            <button
              type="button"
              className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[#f4f0fa] transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100"
              onClick={() => setEntryOpen(key, !isOpen)}
            >
              {isOpen ? "Hide response" : "View response"}
            </button>
          ) : (
            <span className="text-xs text-[#5d556b]">No response</span>
          )}
        </div>
      </div>
      {isOpen ? (
        <div className="mt-3 grid gap-3 border-t border-[#241a3d] pt-3">
          {entry.message ? (
            <AppealDetail icon="send" label="Appeal message" text={entry.message} />
          ) : null}
          {hasResponse ? (
            <AppealDetail
              icon="mail"
              label={responseLabel}
              text={responseText ?? ""}
              html={responseHtml}
              emailDate={formatTime(when)}
              emailStatus={entry.status}
              emailSubject={entry.responseSubject}
              renderEmail
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AppealDetail({
  emailDate,
  emailStatus,
  emailSubject,
  html,
  icon,
  label,
  renderEmail,
  text,
}: {
  emailDate?: string;
  emailStatus?: AppealEntry["status"];
  emailSubject?: string;
  html?: string;
  icon: IconName;
  label: string;
  renderEmail?: boolean;
  text: string;
}) {
  return (
    <div className="rounded-md border border-[#241a3d] bg-[#140e26] p-3">
      <div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#7e7499]">
        <Icon name={icon} size={12} />
        {label}
      </div>
      {renderEmail ? (
        <EmailFrame
          date={emailDate}
          html={html}
          status={emailStatus}
          subject={emailSubject}
          text={text}
          title={label}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#d8d0e6]">{text}</p>
      )}
    </div>
  );
}

function EmailFrame({
  date,
  html,
  status,
  subject,
  text,
  title,
}: {
  date?: string;
  html?: string;
  status?: AppealEntry["status"];
  subject?: string;
  text: string;
  title: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(360);
  const srcDoc = useMemo(
    () => buildEmailFrameSrcDoc({ date, html, status, subject, text }),
    [date, html, status, subject, text],
  );

  function resizeFrame(): void {
    const documentElement = iframeRef.current?.contentDocument?.documentElement;
    const body = iframeRef.current?.contentDocument?.body;
    const contentHeight = Math.max(
      documentElement?.scrollHeight ?? 0,
      body?.scrollHeight ?? 0,
      body?.offsetHeight ?? 0,
    );

    if (contentHeight > 0) {
      setHeight(Math.min(760, Math.max(320, contentHeight + 2)));
    }
  }

  return (
    <iframe
      ref={iframeRef}
      className="w-full rounded-md border border-[#241a3d] bg-white"
      onLoad={resizeFrame}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      style={{ height }}
      title={title}
    />
  );
}
