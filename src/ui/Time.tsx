import { useState } from 'react';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
];

function relative(from: number, now: number): string {
  const diff = from - now;
  const abs = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (abs >= ms || unit === 'second') {
      return fmt.format(Math.round(diff / ms), unit);
    }
  }
  return 'just now';
}

/**
 * A timestamp shown as a human-relative label with the exact UTC value in the
 * `title`/`dateTime` (audit timestamps are UTC — Design §12.3). Invalid/absent
 * values render an em dash rather than "Invalid Date".
 */
export function Time({ value }: { value: string | undefined | null }) {
  // Snapshot the clock once per mount: reading Date.now() during render is
  // impure. This is a point-in-time relative label, not a ticking one.
  const [now] = useState(() => Date.now());
  if (value === undefined || value === null || value === '') {
    return <span className="muted">—</span>;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return <span className="muted">—</span>;
  }
  return (
    <time dateTime={value} title={new Date(ms).toISOString()}>
      {relative(ms, now)}
    </time>
  );
}
