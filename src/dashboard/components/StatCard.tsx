import { Icon, type IconName } from "./Icon";
import { cx } from "./utils";

export function StatCard({
  icon,
  label,
  tone,
  value,
}: {
  icon: IconName;
  label: string;
  tone: "bad" | "good" | "info" | "warn";
  value: number;
}) {
  const toneClass = {
    bad: "text-red-300 bg-red-500/10 border-red-400/20",
    good: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
    info: "text-blue-300 bg-blue-400/10 border-blue-400/20",
    warn: "text-amber-200 bg-amber-400/10 border-amber-400/20",
  }[tone];

  return (
    <article className="rounded-lg border border-[#241a3d] bg-[#140e26] p-5 shadow-[0_10px_30px_-18px_#000]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#7e7499]">
          {label}
        </span>
        <span className={cx("grid size-8 place-items-center rounded-md border", toneClass)}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <div className="mt-4 font-mono text-4xl font-bold tabular-nums text-white">{value}</div>
    </article>
  );
}
