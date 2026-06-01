import { Logger } from "./logger";

const DISCORD_WEBHOOK_URL_PATTERN =
  /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/u;
export const DISCORD_FOOTER_ICON_URL = "https://roappeal.com/roappeal_logo_small.png";

export function isValidDiscordWebhookUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  return DISCORD_WEBHOOK_URL_PATTERN.test(trimmed);
}

export type DiscordWebhookTestEvent = "approved" | "submitted" | "rejected" | "escalated";

export type DiscordWebhookResult = {
  success: boolean;
  error?: string;
  status?: number;
};

export function isDiscordWebhookTestEvent(value: unknown): value is DiscordWebhookTestEvent {
  return (
    value === "approved" || value === "submitted" || value === "rejected" || value === "escalated"
  );
}

function sanitizeWebhookError(value: string): string {
  return value.replace(
    /https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+/giu,
    "https://discord.com/api/webhooks/[redacted]",
  );
}

export async function sendDiscordWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<DiscordWebhookResult> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    return { success: false, error: "Discord webhook URL is not configured" };
  }

  try {
    const { username: _username, ...safePayload } = payload;
    const response = await fetch(trimmed, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(safePayload),
    });

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: `Discord returned HTTP ${response.status}`,
      };
    }

    return { success: true, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Discord webhook error";
    const sanitized = sanitizeWebhookError(message);
    Logger.warning(`Discord webhook failed: ${sanitized}`);
    return { success: false, error: sanitized };
  }
}

export function buildDiscordWebhookTestPayload(
  event: DiscordWebhookTestEvent,
): Record<string, unknown> {
  const meta: Record<DiscordWebhookTestEvent, { color: number; title: string }> = {
    approved: {
      color: 0x22c55e,
      title: "Appeal Approved",
    },
    submitted: {
      color: 0x3b82f6,
      title: "Appeal Submitted",
    },
    rejected: {
      color: 0xef4444,
      title: "Appeal Rejected",
    },
    escalated: {
      color: 0xf97316,
      title: "Appeal Escalated",
    },
  };

  const selected = meta[event];
  return {
    embeds: [
      {
        title: selected.title,
        color: selected.color,
        fields: [
          { name: "Username", value: "`TestAccount`", inline: true },
          { name: "Appeal #", value: "1", inline: true },
        ],
        footer: {
          text: "Enforcement Ban Tool by RoAppeal \u00b7 TEST WEBHOOK",
          icon_url: DISCORD_FOOTER_ICON_URL,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
