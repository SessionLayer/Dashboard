import { useState } from 'react';

import {
  Button,
  ConfirmDialog,
  Detail,
  DetailList,
  Dialog,
  FormActions,
  NumberField,
  ProblemAlert,
  SecretReveal,
  TextField,
  Time,
} from '../../ui';
import type { IssueJoinTokenRequest, JoinTokenResource } from '../../api/types';
import { useIssueJoinToken, useRevokeJoinToken } from './api';

export function IssueJoinTokenDialog({ onClose }: { onClose: () => void }) {
  const issue = useIssueJoinToken();
  const [nodeName, setNodeName] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState<number | ''>('');

  const issued = issue.data;

  const onSubmit = () => {
    if (nodeName.trim() === '') return;
    const body: IssueJoinTokenRequest = {
      nodeName: nodeName.trim(),
      ...(ttlSeconds !== '' ? { ttlSeconds } : {}),
    };
    issue.mutate(body);
  };

  if (issued !== undefined) {
    return (
      <Dialog title="Join token issued" onClose={onClose}>
        <SecretReveal value={issued.token} />
        <DetailList>
          <Detail label="Node">{issued.nodeName}</Detail>
          <Detail label="Single use">{issued.singleUse ? 'Yes' : 'No'}</Detail>
          <Detail label="Expires">
            <Time value={issued.expiresAt} />
          </Detail>
        </DetailList>
        <FormActions>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </FormActions>
      </Dialog>
    );
  }

  return (
    <Dialog title="Issue join token" onClose={onClose}>
      <p className="muted">
        Mints a short-lived, single-use token bound to one node identity. The
        raw token is shown once for out-of-band delivery to the joining agent.
      </p>
      <TextField
        label="Node name"
        value={nodeName}
        onChange={setNodeName}
        required
        hint="The stable node identity the token authorizes an agent to join as."
      />
      <NumberField
        label="TTL (seconds)"
        value={ttlSeconds}
        onChange={setTtlSeconds}
        min={1}
        hint="Optional; clamped to the configured maximum. Empty uses the default."
      />

      {issue.isError && <ProblemAlert error={issue.error} />}

      <FormActions>
        <Button variant="ghost" onClick={onClose} disabled={issue.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={nodeName.trim() === '' || issue.isPending}
        >
          {issue.isPending ? 'Issuing…' : 'Issue token'}
        </Button>
      </FormActions>
    </Dialog>
  );
}

export function RevokeJoinTokenDialog({
  token,
  onClose,
}: {
  token: JoinTokenResource;
  onClose: () => void;
}) {
  const revoke = useRevokeJoinToken();
  return (
    <ConfirmDialog
      title={`Revoke join token for ${token.nodeName}`}
      confirmLabel="Revoke"
      variant="danger"
      pending={revoke.isPending}
      error={revoke.isError ? revoke.error : undefined}
      onConfirm={() => {
        revoke.mutate(token.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p className="muted">
        Deletes the unconsumed token so it can never be used. Revoking an
        already-consumed token does not affect the identity it produced.
        Idempotent.
      </p>
    </ConfirmDialog>
  );
}
