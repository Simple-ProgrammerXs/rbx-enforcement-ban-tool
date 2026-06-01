import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardState } from "../../types";
import { AccountsList } from "./AccountsList";
import { appealPageCount } from "./AppealsList";
import { Nav } from "./Nav";
import { StatCard } from "./StatCard";
import { WebhookPanel } from "./WebhookPanel";

const POLL_MS = 5000;

async function fetchState(): Promise<DashboardState> {
  const response = await fetch("/api/state", { credentials: "same-origin" });
  if (response.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as DashboardState;
}

export function DashboardApp() {
  const [state, setState] = useState<DashboardState>();
  const [banner, setBanner] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const [collapsed, setCollapsedState] = useState<Record<string, boolean>>({});
  const [entryOpen, setEntryOpenState] = useState<Record<string, boolean>>({});
  const [pageOf, setPageOf] = useState<Record<string, number>>({});
  const counts = state?.counts;
  const testMode = state?.testMode === true;
  const accounts = useMemo(() => state?.accounts ?? [], [state?.accounts]);
  const configurationError = state?.configurationError;

  const load = useCallback(async () => {
    try {
      const nextState = await fetchState();
      setState(nextState);
      setBanner(undefined);
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        return;
      }
      setBanner(
        `Connection issue: ${error instanceof Error ? error.message : "Failed to load dashboard"}`,
      );
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [load]);

  useEffect(() => {
    setCollapsedState((current) => {
      let changed = false;
      const next = { ...current };

      accounts.forEach((account, index) => {
        if (next[account.username] === undefined) {
          next[account.username] = testMode ? index !== 0 : true;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [accounts, testMode]);

  useEffect(() => {
    setPageOf((current) => {
      let changed = false;
      const next = { ...current };

      for (const account of accounts) {
        const maxPage = appealPageCount(account);
        if ((next[account.username] ?? 0) > maxPage) {
          next[account.username] = maxPage;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [accounts]);

  const setCollapsed = useCallback((username: string, value: boolean) => {
    setCollapsedState((current) => ({ ...current, [username]: value }));
  }, []);

  const setEntryOpen = useCallback((key: string, value: boolean) => {
    setEntryOpenState((current) => ({ ...current, [key]: value }));
  }, []);

  const setPage = useCallback((username: string, page: number) => {
    setPageOf((current) => ({ ...current, [username]: Math.max(0, page) }));
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(900px_520px_at_82%_-8%,rgba(217,24,24,0.18),transparent_60%),radial-gradient(820px_520px_at_-6%_4%,rgba(111,69,173,0.16),transparent_55%),#0c091d] text-[#f4f0fa]">
      <Nav startedAt={state?.startedAt} now={now} />
      <main className="mx-auto w-full max-w-[1240px] px-5 py-6 sm:px-7">
        <div className="space-y-6">
          {banner ? (
            <p className="rounded-md border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
              {banner}
            </p>
          ) : null}
          {configurationError ? (
            <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
              <p className="font-bold">Configuration error</p>
              <p className="mt-1 break-words text-red-200">{configurationError}</p>
            </div>
          ) : null}
          {!configurationError ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" id="overview">
                <StatCard
                  icon="send"
                  label="Sent"
                  tone="info"
                  value={state?.totalAppealsSent ?? 0}
                />
                <StatCard icon="x" label="Rejected" tone="bad" value={counts?.rejected ?? 0} />
                <StatCard
                  icon="alert"
                  label="Escalated"
                  tone="warn"
                  value={counts?.escalated ?? 0}
                />
                <StatCard icon="check" label="Approved" tone="good" value={counts?.approved ?? 0} />
              </section>
              <WebhookPanel state={state} onRefresh={load} />
              <section id="accounts-section" className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7e7499]">
                  Accounts
                </p>
                <AccountsList
                  accounts={accounts}
                  collapsed={collapsed}
                  entryOpen={entryOpen}
                  now={now}
                  pageOf={pageOf}
                  setCollapsed={setCollapsed}
                  setEntryOpen={setEntryOpen}
                  setPage={setPage}
                />
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
