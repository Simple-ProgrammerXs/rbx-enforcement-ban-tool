import type { AppealEntry, AppealStatus } from "../../types";
import type { IconName } from "./Icon";

export const STATUS_LABEL: Record<AppealStatus, string> = {
  approved: "Approved",
  escalated: "Escalated",
  rejected: "Rejected",
  stale: "Stale",
  submitted: "Submitted",
  unknown: "Pending",
};

export const STATUS_BADGE: Record<AppealStatus, string> = {
  approved: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  escalated: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  rejected: "border-red-400/25 bg-red-500/10 text-red-300",
  stale: "border-orange-400/25 bg-orange-400/10 text-orange-200",
  submitted: "border-blue-400/25 bg-blue-400/10 text-blue-300",
  unknown: "border-white/10 bg-white/[0.04] text-[#8b82a3]",
};

export const ENTRY_LABEL: Record<AppealEntry["status"], string> = {
  approved: "Approved",
  escalated: "Escalated",
  rejected: "Rejected",
  stale: "Stale",
  submitted: "Submitted",
};

export function entryStatusClass(status: AppealEntry["status"]): string {
  if (status === "approved") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "submitted") return "border-blue-400/25 bg-blue-400/10 text-blue-300";
  if (status === "rejected") return "border-red-400/25 bg-red-500/10 text-red-300";
  if (status === "stale") return "border-orange-400/25 bg-orange-400/10 text-orange-200";
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
}

export function statusIconName(status: AppealEntry["status"]): IconName {
  if (status === "approved") return "check";
  if (status === "rejected") return "x";
  if (status === "escalated") return "alert";
  if (status === "stale") return "clock";
  return "send";
}
