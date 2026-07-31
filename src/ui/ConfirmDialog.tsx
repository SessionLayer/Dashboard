import type { ReactNode } from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { ProblemAlert } from './States';

/**
 * A confirm/cancel dialog for a destructive or high-consequence action
 * (terminate, quarantine, revoke, delete, lock). Surfaces a pending state and a
 * failed-mutation problem inline so the operator sees why an action was refused.
 */
export function ConfirmDialog({
  title,
  confirmLabel = 'Confirm',
  variant = 'danger',
  pending = false,
  error,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  pending?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={pending}>
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error !== undefined && error !== null && <ProblemAlert error={error} />}
    </Dialog>
  );
}
