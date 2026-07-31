import type { ReactNode } from 'react';

export type BadgeTone =
  'neutral' | 'pass' | 'warn' | 'fail' | 'info' | 'accent';

/** A small status pill. Tone is decorative; the text carries the meaning (a11y). */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
