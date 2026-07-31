/** Presentation helpers shared by the observability screens. */

/** Human-readable byte size (binary units). */
export function formatBytes(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${String(n)} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i] ?? 'B'}`;
}

/** `m:ss` clock for a playback offset in seconds. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm)}:${ss.toString().padStart(2, '0')}`;
}

/** Short id for dense tables — the first label of a UUID. */
export function shortId(id: string | undefined): string {
  if (id === undefined || id === '') return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** A terse `k=v k2=v2` rendering of an audit event's `detail` selector for a table cell. */
export function summarizeDetail(
  detail: Record<string, unknown> | undefined,
): string {
  const entries = detail ? Object.entries(detail) : [];
  if (entries.length === 0) return '—';
  return entries
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ');
}
