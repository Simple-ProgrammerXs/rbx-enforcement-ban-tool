import type { AccountDashboardState } from "../../types";
import { AccountCard } from "./AccountCard";

export function AccountsList({
  accounts,
  collapsed,
  entryOpen,
  now,
  pageOf,
  setCollapsed,
  setEntryOpen,
  setPage,
}: {
  accounts: AccountDashboardState[];
  collapsed: Record<string, boolean>;
  entryOpen: Record<string, boolean>;
  now: number;
  pageOf: Record<string, number>;
  setCollapsed: (username: string, value: boolean) => void;
  setEntryOpen: (key: string, value: boolean) => void;
  setPage: (username: string, page: number) => void;
}) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-8 text-center text-sm text-[#7e7499]">
        No accounts loaded.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accounts.map((account) => (
        <AccountCard
          key={account.username}
          account={account}
          collapsed={collapsed[account.username] ?? true}
          entryOpen={entryOpen}
          now={now}
          page={pageOf[account.username] ?? 0}
          setCollapsed={setCollapsed}
          setEntryOpen={setEntryOpen}
          setPage={setPage}
        />
      ))}
    </div>
  );
}
