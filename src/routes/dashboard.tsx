import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { DashboardApp } from "../dashboard/components/DashboardApp";

const isDashboardRouteAuthenticated = createServerFn({ method: "GET" }).handler(async () => {
  const [{ getRequest }, { isDashboardAuthenticated }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("../start/auth"),
  ]);

  return isDashboardAuthenticated(getRequest());
});

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (!(await isDashboardRouteAuthenticated())) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardApp,
});
