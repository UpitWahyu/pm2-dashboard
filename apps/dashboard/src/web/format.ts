export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export function formatUptime(startEpochMs: number): string {
  if (!startEpochMs || startEpochMs <= 0) return "—";
  const ms = Date.now() - startEpochMs;
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}h ${h % 24}j`;
}
