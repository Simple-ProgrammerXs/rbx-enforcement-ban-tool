import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import { PROJECT_ROOT } from "../config";

const DB_DIR = process.env.TEST_PROJECT_ROOT
  ? resolve(process.env.TEST_PROJECT_ROOT, "data")
  : resolve(process.env.DATA_DIR ?? resolve(PROJECT_ROOT, "data"));
const DB_PATH = resolve(DB_DIR, "appeals.sqlite");

type ResponseStatus = "submitted" | "rejected" | "approved" | "escalated";

export interface AppealRecord {
  id: number;
  username: string;
  email: string;
  submittedAt: number;
  bootstrapped?: boolean;
  message?: string;
  responseMessageId?: string;
  responseFingerprint?: string;
  responseStatus?: ResponseStatus;
  responseSubject?: string;
  responseBody?: string;
  responseHtml?: string;
  respondedAt?: number;
}

type AppealRow = {
  id: number;
  username: string;
  email: string;
  submitted_at: number;
  bootstrapped: number;
  message: string | null;
  response_message_id: string | null;
  response_fingerprint: string | null;
  response_status: ResponseStatus | null;
  response_subject: string | null;
  response_body: string | null;
  response_html: string | null;
  responded_at: number | null;
};

function ensureDir(): void {
  mkdirSync(DB_DIR, { recursive: true });
}

function hasColumn(table: string, column: string): boolean {
  return db
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);
}

function addColumnIfMissing(table: string, columnName: string, definition: string): void {
  if (!hasColumn(table, columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition};`);
  }
}

function mapAppeal(row: AppealRow): AppealRecord {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    submittedAt: row.submitted_at,
    ...(row.bootstrapped ? { bootstrapped: true } : {}),
    ...(row.message ? { message: row.message } : {}),
    ...(row.response_message_id ? { responseMessageId: row.response_message_id } : {}),
    ...(row.response_fingerprint ? { responseFingerprint: row.response_fingerprint } : {}),
    ...(row.response_status ? { responseStatus: row.response_status } : {}),
    ...(row.response_subject ? { responseSubject: row.response_subject } : {}),
    ...(row.response_body ? { responseBody: row.response_body } : {}),
    ...(row.response_html ? { responseHtml: row.response_html } : {}),
    ...(row.responded_at ? { respondedAt: row.responded_at } : {}),
  };
}

ensureDir();

const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_normalized TEXT NOT NULL,
    email TEXT NOT NULL,
    submitted_at INTEGER NOT NULL,
    bootstrapped INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    response_message_id TEXT UNIQUE,
    response_fingerprint TEXT,
    response_status TEXT CHECK (
      response_status IS NULL OR
      response_status IN ('submitted', 'rejected', 'approved', 'escalated')
    ),
    response_subject TEXT,
    response_body TEXT,
    response_html TEXT,
    responded_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_appeals_username_submitted
    ON appeals (username_normalized, submitted_at);

  CREATE INDEX IF NOT EXISTS idx_appeals_response_message_id
    ON appeals (response_message_id);
`);

// Migrate databases created before the message/response columns existed.
addColumnIfMissing("appeals", "message", "message TEXT");
addColumnIfMissing("appeals", "response_body", "response_body TEXT");
addColumnIfMissing("appeals", "response_html", "response_html TEXT");
addColumnIfMissing("appeals", "response_fingerprint", "response_fingerprint TEXT");

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_appeals_response_fingerprint
    ON appeals (response_fingerprint)
    WHERE response_fingerprint IS NOT NULL;
`);

// Persisted dashboard login sessions, so authentication survives a restart.
db.exec(`
  CREATE TABLE IF NOT EXISTS dashboard_sessions (
    token TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dashboard_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const upsertSession = db.query<null, [string, number]>(
  `INSERT OR REPLACE INTO dashboard_sessions (token, expires_at) VALUES (?, ?)`,
);
const deleteSessionStmt = db.query<null, [string]>(
  `DELETE FROM dashboard_sessions WHERE token = ?`,
);
const deleteExpiredSessions = db.query<null, [number]>(
  `DELETE FROM dashboard_sessions WHERE expires_at <= ?`,
);
const selectSessions = db.query<{ token: string; expires_at: number }, []>(
  `SELECT token, expires_at FROM dashboard_sessions`,
);
const upsertDashboardSetting = db.query<null, [string, string]>(
  `INSERT OR REPLACE INTO dashboard_settings (key, value) VALUES (?, ?)`,
);
const selectDashboardSetting = db.query<{ value: string }, [string]>(
  `SELECT value FROM dashboard_settings WHERE key = ? LIMIT 1`,
);

const RETURNING_COLUMNS = `
  id,
  username,
  email,
  submitted_at,
  bootstrapped,
  message,
  response_message_id,
  response_fingerprint,
  response_status,
  response_subject,
  response_body,
  response_html,
  responded_at
`;

const insertAppeal = db.query<AppealRow, [string, string, string, number, number, string | null]>(`
  INSERT INTO appeals (
    username,
    username_normalized,
    email,
    submitted_at,
    bootstrapped,
    message
  )
  VALUES (?, ?, ?, ?, ?, ?)
  RETURNING ${RETURNING_COLUMNS}
`);

const selectAppealsForAccount = db.query<AppealRow, [string]>(`
  SELECT ${RETURNING_COLUMNS}
  FROM appeals
  WHERE username_normalized = ?
  ORDER BY submitted_at ASC, id ASC
`);

const selectLatestSubmissionForEmail = db.query<AppealRow, [string]>(`
  SELECT ${RETURNING_COLUMNS}
  FROM appeals
  WHERE lower(email) = ?
  ORDER BY submitted_at DESC, id DESC
  LIMIT 1
`);

const selectPendingAppealForEmailResponse = db.query<AppealRow, [string, number]>(`
  SELECT ${RETURNING_COLUMNS}
  FROM appeals
  WHERE lower(email) = ?
    AND submitted_at <= ?
    AND bootstrapped = 0
    AND (
      response_message_id IS NULL OR
      response_status = 'submitted'
    )
  ORDER BY submitted_at DESC, id DESC
  LIMIT 1
`);

const selectResponseMessage = db.query<
  { id: number; response_body: string | null; response_html: string | null },
  [string, string]
>(`
  SELECT id, response_body, response_html
  FROM appeals
  WHERE response_message_id = ?
    OR response_fingerprint = ?
  LIMIT 1
`);

const selectTargetAppeal = db.query<AppealRow, [string, number, number]>(`
  SELECT ${RETURNING_COLUMNS}
  FROM appeals
  WHERE username_normalized = ?
    AND submitted_at <= ?
    AND (
      response_message_id IS NULL OR
      (? = 1 AND response_status = 'submitted')
    )
  ORDER BY submitted_at DESC, id DESC
  LIMIT 1
`);

const selectSubmittedConfirmationTarget = db.query<AppealRow, [string, number, number, number]>(`
  SELECT ${RETURNING_COLUMNS}
  FROM appeals
  WHERE username_normalized = ?
    AND response_message_id IS NULL
    AND response_status IS NULL
    AND submitted_at BETWEEN ? AND ?
  ORDER BY ABS(submitted_at - ?) ASC, submitted_at DESC, id DESC
  LIMIT 1
`);

const updateAppealResponse = db.query<
  AppealRow,
  [string, string, ResponseStatus, string, string | null, string | null, number, number]
>(`
  UPDATE appeals
  SET
    response_message_id = ?,
    response_fingerprint = ?,
    response_status = ?,
    response_subject = ?,
    response_body = ?,
    response_html = ?,
    responded_at = ?
  WHERE id = ?
  RETURNING ${RETURNING_COLUMNS}
`);

const updateAppealResponseContent = db.query<null, [string | null, string | null, number]>(`
  UPDATE appeals
  SET
    response_body = ?,
    response_html = ?
  WHERE id = ?
`);

export function addSubmission(
  username: string,
  email: string,
  submittedAt?: number,
  bootstrapped?: boolean,
  message?: string,
): AppealRecord {
  const row = insertAppeal.get(
    username,
    username.toLowerCase(),
    email,
    submittedAt ?? Date.now(),
    bootstrapped ? 1 : 0,
    message ?? null,
  );

  if (!row) {
    throw new Error("Failed to insert appeal submission");
  }

  return mapAppeal(row);
}

function responseFingerprint(messageId: string, subject: string): string {
  const ticketMatch = subject.match(/\broblox\s+support\s+ticket\s*#?\s*([0-9]+)/iu);
  if (ticketMatch) {
    return `roblox-support-ticket:${ticketMatch[1]}`;
  }

  return `message-id:${messageId.trim()}`;
}

function hasResponseMessage(
  messageId: string,
  fingerprint: string,
  body?: string,
  html?: string,
): boolean {
  const existing = selectResponseMessage.get(messageId, fingerprint);
  if (!existing) {
    return false;
  }

  const nextBody = existing.response_body ?? body ?? null;
  const nextHtml = existing.response_html ?? html ?? null;
  if (nextBody !== existing.response_body || nextHtml !== existing.response_html) {
    updateAppealResponseContent.run(nextBody, nextHtml, existing.id);
  }

  return true;
}

function findTargetAppeal(
  username: string,
  respondedAt: number,
  allowOverwriteSubmitted: boolean,
): AppealRecord | undefined {
  const row = selectTargetAppeal.get(
    username.toLowerCase(),
    respondedAt,
    allowOverwriteSubmitted ? 1 : 0,
  );

  return row ? mapAppeal(row) : undefined;
}

function findSubmittedConfirmationTarget(
  username: string,
  respondedAt: number,
): AppealRecord | undefined {
  const timestampWindowMs = 120_000;
  const row = selectSubmittedConfirmationTarget.get(
    username.toLowerCase(),
    respondedAt - timestampWindowMs,
    respondedAt + timestampWindowMs,
    respondedAt,
  );

  return row ? mapAppeal(row) : findTargetAppeal(username, respondedAt, false);
}

function setAppealResponse(
  id: number,
  messageId: string,
  fingerprint: string,
  status: ResponseStatus,
  subject: string,
  respondedAt: number,
  body?: string,
  html?: string,
): boolean {
  const row = updateAppealResponse.get(
    messageId,
    fingerprint,
    status,
    subject,
    body ?? null,
    html ?? null,
    respondedAt,
    id,
  );
  return Boolean(row);
}

export function recordResponse(
  username: string,
  messageId: string,
  status: ResponseStatus,
  subject: string,
  respondedAt: number,
  body?: string,
  html?: string,
): boolean {
  const fingerprint = responseFingerprint(messageId, subject);
  if (hasResponseMessage(messageId, fingerprint, body, html)) {
    return false;
  }

  const canOverwrite = status !== "submitted";
  const target = findTargetAppeal(username, respondedAt, canOverwrite);
  if (!target) {
    return false;
  }

  return setAppealResponse(
    target.id,
    messageId,
    fingerprint,
    status,
    subject,
    respondedAt,
    body,
    html,
  );
}

export function recordSubmittedConfirmation(
  username: string,
  messageId: string,
  subject: string,
  respondedAt: number,
  body?: string,
  html?: string,
): boolean {
  const fingerprint = responseFingerprint(messageId, subject);
  if (hasResponseMessage(messageId, fingerprint, body, html)) {
    return false;
  }

  const target = findSubmittedConfirmationTarget(username, respondedAt);
  if (!target) {
    return false;
  }

  return setAppealResponse(
    target.id,
    messageId,
    fingerprint,
    "submitted",
    subject,
    respondedAt,
    body,
    html,
  );
}

export function recordHumanTicket(
  username: string,
  messageId: string,
  subject: string,
  respondedAt: number,
  body?: string,
  html?: string,
): boolean {
  const fingerprint = responseFingerprint(messageId, subject);
  if (hasResponseMessage(messageId, fingerprint, body, html)) {
    return false;
  }

  const target = findTargetAppeal(username, respondedAt, true);
  if (!target) {
    return false;
  }

  return setAppealResponse(
    target.id,
    messageId,
    fingerprint,
    "escalated",
    subject,
    respondedAt,
    body,
    html,
  );
}

export function recordHumanTicketForEmail(
  email: string,
  messageId: string,
  subject: string,
  respondedAt: number,
  body?: string,
  html?: string,
): boolean {
  const fingerprint = responseFingerprint(messageId, subject);
  if (hasResponseMessage(messageId, fingerprint, body, html)) {
    return false;
  }

  const row = selectPendingAppealForEmailResponse.get(email.trim().toLowerCase(), respondedAt);
  if (!row) {
    return false;
  }

  return setAppealResponse(
    row.id,
    messageId,
    fingerprint,
    "escalated",
    subject,
    respondedAt,
    body,
    html,
  );
}

export function getAppealsForAccount(username: string): AppealRecord[] {
  return selectAppealsForAccount.all(username.toLowerCase()).map(mapAppeal);
}

export function getLatestAppeal(username: string): AppealRecord | undefined {
  const appeals = getAppealsForAccount(username);
  return appeals.length > 0 ? appeals[appeals.length - 1] : undefined;
}

export function getLatestSubmissionForEmail(email: string): AppealRecord | undefined {
  const row = selectLatestSubmissionForEmail.get(email.trim().toLowerCase());
  return row ? mapAppeal(row) : undefined;
}

export function getAccountStatus(username: string): ResponseStatus | "unknown" {
  const appeals = getAppealsForAccount(username);
  if (appeals.length === 0) {
    return "unknown";
  }

  const latest = appeals[appeals.length - 1]!;
  if (!latest.responseStatus || latest.responseStatus === "submitted") {
    return "submitted";
  }

  return latest.responseStatus;
}

export function saveSession(token: string, expiresAt: number): void {
  upsertSession.run(token, expiresAt);
}

export function deleteSession(token: string): void {
  deleteSessionStmt.run(token);
}

/** Return all non-expired sessions, pruning expired rows as a side effect. */
export function loadActiveSessions(now: number = Date.now()): {
  token: string;
  expiresAt: number;
}[] {
  deleteExpiredSessions.run(now);
  return selectSessions.all().map((row) => ({ token: row.token, expiresAt: row.expires_at }));
}

export function saveDashboardWebhookUrl(webhookUrl: string): void {
  upsertDashboardSetting.run("discord_webhook_url", webhookUrl.trim());
}

export function loadSavedDashboardWebhookUrl(): string | undefined {
  return selectDashboardSetting.get("discord_webhook_url")?.value;
}
