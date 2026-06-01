import { useCallback } from "react";
import { Icon } from "./Icon";
import { formatUptime } from "./utils";

const REPO_URL = "https://github.com/RoAppeal/rbx-enforcement-ban-tool";

export function Nav({ startedAt, now }: { startedAt?: number; now: number }) {
  const logout = useCallback(async () => {
    try {
      await fetch("/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      window.location.href = "/login";
    }
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-[#241a3d] bg-[#100a22]/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-7">
        <a
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          <span className="grid size-11 shrink-0 place-items-center">
            <img
              className="h-full w-full object-contain"
              src="https://roappeal.com/roappeal_logo_small.png"
              alt="RoAppeal"
            />
          </span>
          <span className="min-w-0 leading-tight">
            <strong className="flex flex-wrap items-center gap-2 text-[17px] text-white">
              RoAppeal
              <span className="rounded border border-red-400/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.08em] text-red-300">
                OSS
              </span>
            </strong>
            <span className="block truncate text-xs text-[#7e7499]">Enforcement Ban Tool</span>
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[#b5abc9]">
            Uptime: <b className="font-mono text-[#f4f0fa]">{formatUptime(startedAt, now)}</b>
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-[#f4f0fa] transition hover:border-red-400/30 hover:bg-red-500/10"
            onClick={logout}
          >
            <Icon name="logout" size={16} />
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
