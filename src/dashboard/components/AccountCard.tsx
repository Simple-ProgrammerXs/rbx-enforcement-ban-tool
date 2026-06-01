import type { AccountDashboardState } from "../../types";
import { AppealsList } from "./AppealsList";
import { Icon } from "./Icon";
import { STATUS_BADGE, STATUS_LABEL } from "./status";
import { cx, formatRelative, formatTime } from "./utils";

export function AccountCard({
  account,
  collapsed,
  entryOpen,
  now,
  page,
  setCollapsed,
  setEntryOpen,
  setPage,
}: {
  account: AccountDashboardState;
  collapsed: boolean;
  entryOpen: Record<string, boolean>;
  now: number;
  page: number;
  setCollapsed: (username: string, value: boolean) => void;
  setEntryOpen: (key: string, value: boolean) => void;
  setPage: (username: string, page: number) => void;
}) {
  const open = !collapsed;
  const waiting =
    account.rejectionWaitUntil && account.rejectionWaitUntil > now
      ? account.rejectionWaitUntil
      : undefined;

  return (
    <article className="overflow-hidden rounded-lg border border-[#241a3d] bg-[#140e26]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-white/[0.025]"
        aria-expanded={open}
        onClick={() => setCollapsed(account.username, open)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-semibold text-white" title={account.username}>
            {account.username}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={cx(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
              STATUS_BADGE[account.status],
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {STATUS_LABEL[account.status]}
          </span>
          <span className={cx("text-[#7e7499] transition-transform", open && "rotate-180")}>
            <Icon name="chevron" size={16} />
          </span>
        </div>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-[#241a3d] p-4">
          {waiting ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
              <Icon name="clock" size={14} />
              Resubmitting {formatRelative(waiting, now)}
            </span>
          ) : null}
          {account.lastError ? (
            <p className="rounded-md border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
              {account.lastError}
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <InfoField label="Email monitoring" value={account.email} />
            <InfoField label="Last action" value={account.lastAction || "None"} />
            <InfoField
              label="Last checked"
              value={account.lastCheckedAt ? formatRelative(account.lastCheckedAt, now) : "Never"}
              title={formatTime(account.lastCheckedAt)}
            />
          </div>
          <AppealsList
            account={account}
            entryOpen={entryOpen}
            page={page}
            setEntryOpen={setEntryOpen}
            setPage={setPage}
          />
        </div>
      ) : null}
    </article>
  );
}

function InfoField({ label, title, value }: { label: string; title?: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.025] p-3">
      <span className="block text-xs font-bold uppercase tracking-[0.1em] text-[#7e7499]">
        {label}
      </span>
      <span className="mt-1 block truncate text-sm text-[#f4f0fa]" title={title ?? value}>
        {value}
      </span>
    </div>
  );
}
