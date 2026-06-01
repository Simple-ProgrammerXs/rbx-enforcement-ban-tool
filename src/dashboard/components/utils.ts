export function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatTime(value?: number): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function formatRelative(value: number | undefined, now: number): string {
  if (!value) return "-";

  const deltaMs = value - now;
  const future = deltaMs > 0;
  const seconds = Math.round(Math.abs(deltaMs) / 1000);
  if (seconds < 60) return future ? `in ${seconds}s` : `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  return future ? `in ${hours}h` : `${hours}h ago`;
}

export function formatUptime(startedAt: number | undefined, now: number): string {
  if (!startedAt) return "-";

  let seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
