import { useState } from 'react';

import { Button } from './Button';

export function CopyButton({
  value,
  label = 'Copy',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    const clip = (navigator as { clipboard?: Clipboard }).clipboard;
    if (clip === undefined) return;
    void clip
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 1500);
      })
      .catch(() => {
        /* clipboard denied — leave the value visible for manual copy */
      });
  };
  return (
    <Button size="sm" variant="ghost" onClick={onCopy} aria-live="polite">
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function SecretReveal({
  value,
  caption = 'Copy this now — it is shown once and cannot be retrieved again.',
}: {
  value: string;
  caption?: string;
}) {
  return (
    <div className="secret-reveal">
      <code className="secret-value">{value}</code>
      <CopyButton value={value} />
      <p className="muted secret-caption">{caption}</p>
    </div>
  );
}
