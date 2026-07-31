import type { ReactNode } from 'react';

/** A key/value detail list for resource detail panels (`dl`). */
export function DetailList({ children }: { children: ReactNode }) {
  return <dl className="detail-list">{children}</dl>;
}

export function Detail({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Render a `string->string` label map as chips (node labels, tags). */
export function LabelMapView({
  labels,
}: {
  labels: Record<string, string> | undefined | null;
}) {
  const entries = labels ? Object.entries(labels) : [];
  if (entries.length === 0) return <span className="muted">—</span>;
  return (
    <span className="label-chips">
      {entries.map(([k, v]) => (
        <span key={k} className="label-chip">
          <span className="label-chip-key">{k}</span>
          <span className="label-chip-val">{v}</span>
        </span>
      ))}
    </span>
  );
}

/** Pretty-print a JSON value read-only (selectors, audit detail). Escaped text only. */
export function CodeBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) {
    return <span className="muted">—</span>;
  }
  return (
    <pre className="code-block">
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  );
}
