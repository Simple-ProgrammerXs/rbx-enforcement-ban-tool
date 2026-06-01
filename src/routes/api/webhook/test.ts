import { createFileRoute } from "@tanstack/react-router";
import {
  buildDiscordWebhookTestPayload,
  isDiscordWebhookTestEvent,
  sendDiscordWebhook,
} from "../../../modules/discordWebhook";
import { isDashboardAuthenticated } from "../../../start/auth";
import { getDashboardWebhookUrl } from "../../../start/dashboardState";

export const Route = createFileRoute("/api/webhook/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isDashboardAuthenticated(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as { event?: unknown };
        if (!isDiscordWebhookTestEvent(body.event)) {
          return Response.json({ error: "Choose a valid test event" }, { status: 400 });
        }

        const webhookUrl = getDashboardWebhookUrl().trim();
        if (!webhookUrl) {
          return Response.json({ error: "Save a Discord webhook before testing" }, { status: 400 });
        }

        const result = await sendDiscordWebhook(
          webhookUrl,
          buildDiscordWebhookTestPayload(body.event),
        );
        if (!result.success) {
          return Response.json(
            { error: result.error ?? "Discord webhook test failed" },
            { status: 502 },
          );
        }

        return Response.json({ message: `Sent ${body.event} test webhook` });
      },
    },
  },
});
