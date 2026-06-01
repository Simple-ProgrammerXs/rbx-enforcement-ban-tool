import { createFileRoute } from "@tanstack/react-router";
import { handleDashboardLogin } from "../start/auth";

const REPO_URL = "https://github.com/RoAppeal/rbx-enforcement-ban-tool";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  server: {
    handlers: {
      POST: async ({ request }) => handleDashboardLogin(request),
    },
  },
});

function LoginPage() {
  const hasError =
    typeof window !== "undefined" &&
    new URL(window.location.href).searchParams.get("error") === "1";

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(900px_520px_at_82%_-8%,rgba(217,24,24,0.18),transparent_60%),radial-gradient(820px_520px_at_-6%_4%,rgba(111,69,173,0.16),transparent_55%),#0c091d] p-6 text-[#f4f0fa]">
      <form className="grid w-[min(360px,calc(100vw-32px))] gap-3" method="post" action="/login">
        <div>
          <a
            className="mb-3 inline-flex min-w-0 items-center gap-2 text-inherit no-underline"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span className="grid size-8 shrink-0 place-items-center">
              <img
                className="h-full w-full object-contain"
                src="https://roappeal.com/roappeal_logo_small.png"
                alt="RoAppeal"
              />
            </span>
            <strong className="text-[17px] text-white">RoAppeal</strong>
          </a>
          <h1 className="text-2xl font-bold text-white">Enforcement Ban Tool</h1>
          <p className="mt-1 text-sm text-[#7e7499]">Enter your dashboard password</p>
        </div>
        {hasError ? (
          <div className="rounded-md border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200">
            Invalid password
          </div>
        ) : null}
        <input
          className="rounded-md border border-[#332347] bg-[#100a22] px-3 py-3 text-sm text-[#f4f0fa] outline-none transition placeholder:text-[#5d556b] focus:border-red-500 focus:ring-2 focus:ring-red-500/25"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          required
          autoFocus
        />
        <button
          className="rounded-md bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-500"
          type="submit"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
