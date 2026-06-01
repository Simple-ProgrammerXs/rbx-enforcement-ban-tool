import { createFileRoute } from "@tanstack/react-router";
import { handleDashboardLogout } from "../start/auth";

export const Route = createFileRoute("/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => handleDashboardLogout(request),
    },
  },
});
