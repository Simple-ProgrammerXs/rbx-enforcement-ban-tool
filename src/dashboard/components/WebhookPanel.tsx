import { useCallback, useEffect, useState } from "react";
import type { DashboardState } from "../../types";
import { Icon } from "./Icon";
import { statusIconName } from "./status";
import { cx } from "./utils";

const WEBHOOK_TEST_EVENTS = ["submitted", "approved", "rejected", "escalated"] as const;
type WebhookTestEvent = (typeof WEBHOOK_TEST_EVENTS)[number];

export function WebhookPanel({
  onRefresh,
  state,
}: {
  onRefresh: () => Promise<void>;
  state?: DashboardState;
}) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean }>();
  const [saving, setSaving] = useState(false);
  const [testMenuOpen, setTestMenuOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showWebhookUrl, setShowWebhookUrl] = useState(false);
  const configured = state?.discordWebhookEnabled === true;
  const configuredWebhookUrl = state?.discordWebhookUrl ?? "";
  const displayedValue = configured && !showWebhookUrl ? "HIDDEN" : value;
  const loaded = state !== undefined;

  useEffect(() => {
    setValue(configuredWebhookUrl);
    setShowWebhookUrl(false);
  }, [configuredWebhookUrl]);

  const updateWebhook = useCallback(
    async (webhookUrl: string) => {
      setSaving(true);
      setMessage({ text: webhookUrl ? "Saving..." : "Clearing...", error: false });
      try {
        const response = await fetch("/api/webhook", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ webhookUrl }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setMessage(
          response.ok
            ? undefined
            : { text: data.error ?? data.message ?? "Webhook update failed", error: true },
        );
        if (response.ok) {
          await onRefresh();
        }
      } catch {
        setMessage({ text: "Could not reach the server", error: true });
      } finally {
        setSaving(false);
      }
    },
    [onRefresh],
  );

  const save = useCallback(async () => {
    await updateWebhook(value.trim());
  }, [updateWebhook, value]);

  const clear = useCallback(async () => {
    await updateWebhook("");
  }, [updateWebhook]);

  const sendTest = useCallback(async (event: WebhookTestEvent) => {
    setTesting(true);
    setTestMenuOpen(false);
    setMessage({ text: "Sending test webhook...", error: false });
    try {
      const response = await fetch("/api/webhook/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      setMessage({
        text: data.message ?? data.error ?? "Webhook test sent",
        error: !response.ok,
      });
    } catch {
      setMessage({ text: "Could not reach the server", error: true });
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <section className="rounded-lg border border-[#241a3d] bg-[#140e26] p-5" id="webhook">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7e7499]">
          Discord webhook
        </p>
        {loaded ? (
          <span
            className={cx(
              "inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
              configured
                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                : "border-white/10 bg-white/[0.04] text-[#b5abc9]",
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            <span className="truncate">{configured ? "Active" : "Not configured"}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <input
            className="w-full rounded-md border border-[#332347] bg-[#100a22] px-3 py-2.5 pr-12 text-sm text-[#f4f0fa] outline-none transition placeholder:text-[#5d556b] read-only:cursor-default read-only:text-[#d8d0e6] focus:border-red-500 focus:ring-2 focus:ring-red-500/25 disabled:cursor-not-allowed disabled:text-[#b5abc9]"
            type="url"
            value={displayedValue}
            disabled={saving}
            readOnly={configured}
            placeholder="https://discord.com/api/webhooks/..."
            aria-label="Discord webhook URL"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (!configured && event.key === "Enter") {
                event.preventDefault();
                void save();
              }
            }}
          />
          {configured ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded text-[#b5abc9] transition hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/25"
              aria-label={showWebhookUrl ? "Hide Discord webhook URL" : "Show Discord webhook URL"}
              aria-pressed={showWebhookUrl}
              onClick={() => setShowWebhookUrl((shown) => !shown)}
            >
              <Icon name={showWebhookUrl ? "eye-off" : "eye"} size={17} />
            </button>
          ) : null}
        </div>
        <div className="flex gap-2 sm:shrink-0">
          {!configured ? (
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none"
              disabled={saving || value.trim() === ""}
              onClick={() => void save()}
            >
              Save
            </button>
          ) : null}
          {configured ? (
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center rounded-md border border-white/10 px-4 py-2.5 text-sm font-bold text-[#d8d0e6] transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-55 sm:flex-none"
              disabled={saving}
              onClick={() => void clear()}
            >
              Clear
            </button>
          ) : null}
          {configured ? (
            <div className="relative">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-400/25 bg-blue-400/10 px-4 py-2.5 text-sm font-bold text-blue-100 transition hover:border-blue-300/40 hover:bg-blue-400/15 disabled:cursor-not-allowed disabled:opacity-55"
                aria-expanded={testMenuOpen}
                aria-haspopup="menu"
                disabled={testing || saving}
                onClick={() => setTestMenuOpen((open) => !open)}
              >
                Test
                <Icon name="chevron" size={15} />
              </button>
              {testMenuOpen ? (
                <div
                  className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-md border border-[#332347] bg-[#100a22] p-1 shadow-2xl shadow-black/30"
                  role="menu"
                >
                  {WEBHOOK_TEST_EVENTS.map((event) => (
                    <button
                      key={event}
                      type="button"
                      className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm font-semibold capitalize text-[#d8d0e6] transition hover:bg-white/[0.06] hover:text-white"
                      role="menuitem"
                      onClick={() => void sendTest(event)}
                    >
                      {event}
                      <Icon name={statusIconName(event)} size={14} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {message ? (
        <p
          className={cx(
            "mt-3 inline-flex items-center gap-2 text-sm",
            message.error ? "text-red-300" : "text-[#b5abc9]",
          )}
        >
          {!message.error ? <Icon name="check" size={14} /> : null}
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
