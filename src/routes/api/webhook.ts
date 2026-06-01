import { createFileRoute } from "@tanstack/react-router";
import { saveDashboardWebhookUrl } from "../../modules/database";
import { isValidDiscordWebhookUrl } from "../../modules/discordWebhook";
import { isDashboardAuthenticated } from "../../start/auth";
import { setDashboardWebhook } from "../../start/dashboardState";

export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isDashboardAuthenticated(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as { webhookUrl?: string };
        const webhookUrl = body.webhookUrl?.trim() ?? "";

        if (!isValidDiscordWebhookUrl(webhookUrl)) {
          return Response.json({ error: "Invalid Discord webhook URL" }, { status: 400 });
        }

        try {
          saveDashboardWebhookUrl(webhookUrl);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown database write error";
          return Response.json({ error: `Failed to save webhook: ${message}` }, { status: 500 });
        }

        const maskedWebhookUrl = setDashboardWebhook(webhookUrl);
        return Response.json({
          message: webhookUrl ? "Discord webhook saved" : "Discord webhook removed",
          maskedWebhookUrl,
        });
      },
    },
  },
});
