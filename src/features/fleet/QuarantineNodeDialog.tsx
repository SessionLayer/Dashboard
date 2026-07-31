import { useState } from 'react';

import {
  ConfirmDialog,
  NumberField,
  SelectField,
  TextareaField,
} from '../../ui';
import type { NodeResource, QuarantineNodeRequest } from '../../api/types';
import { useQuarantineNode } from './api';

type ExistingSessions = NonNullable<QuarantineNodeRequest['existingSessions']>;

const EXISTING_OPTIONS: readonly { value: ExistingSessions; label: string }[] =
  [
    { value: 'kill', label: 'Kill — tear down existing sessions at once' },
    { value: 'drain', label: 'Drain — finish existing; no new channels' },
  ];

export function QuarantineNodeDialog({
  node,
  onClose,
}: {
  node: NodeResource;
  onClose: () => void;
}) {
  const quarantine = useQuarantineNode();
  const [reason, setReason] = useState('');
  const [existingSessions, setExistingSessions] =
    useState<ExistingSessions>('kill');
  const [ttlSeconds, setTtlSeconds] = useState<number | ''>('');

  const onConfirm = () => {
    if (reason.trim() === '') return;
    const body: QuarantineNodeRequest = {
      reason: reason.trim(),
      existingSessions,
      ...(ttlSeconds !== '' ? { ttlSeconds } : {}),
    };
    quarantine.mutate({ nodeId: node.id, body }, { onSuccess: onClose });
  };

  return (
    <ConfirmDialog
      title={`Quarantine ${node.name}`}
      confirmLabel="Quarantine"
      variant="danger"
      pending={quarantine.isPending}
      error={quarantine.isError ? quarantine.error : undefined}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <p className="muted">
        Blocks new sessions and pushes a top-tier lock to every Gateway
        (fail-closed). Existing sessions are handled per the policy below.
      </p>
      <TextareaField
        label="Reason"
        value={reason}
        onChange={setReason}
        required
        rows={2}
        hint="Operator/audit reason (never disclosed to the SSH user)."
      />
      <SelectField
        label="Existing sessions"
        value={existingSessions}
        onChange={setExistingSessions}
        options={EXISTING_OPTIONS}
      />
      <NumberField
        label="TTL (seconds)"
        value={ttlSeconds}
        onChange={setTtlSeconds}
        min={1}
        hint="Optional lock lifetime; empty = indefinite until released."
      />
    </ConfirmDialog>
  );
}
