import { createFileRoute } from "@tanstack/react-router";
import { isDashboardAuthenticated } from "../../start/auth";
import { getDashboardState } from "../../start/dashboardState";

export const Route = createFileRoute("/api/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isDashboardAuthenticated(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        return Response.json(getDashboardState());
      },
    },
  },
});
