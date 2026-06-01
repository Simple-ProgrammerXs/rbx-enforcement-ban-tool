import { createFileRoute } from "@tanstack/react-router";
import { DashboardApp } from "../dashboard/components/DashboardApp";

export const Route = createFileRoute("/dashboard")({
  component: DashboardApp,
});
