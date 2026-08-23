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
import type {
  GatewayEnrollmentTokenResource,
  IssueGatewayEnrollmentTokenRequest,
} from '../../api/types';
import {
  useIssueGatewayEnrollmentToken,
  useRevokeGatewayEnrollmentToken,
} from './api';

export function IssueGatewayEnrollmentTokenDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const issue = useIssueGatewayEnrollmentToken();
  const [gatewayName, setGatewayName] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState<number | ''>('');

  const issued = issue.data;

  const onSubmit = () => {
    if (gatewayName.trim() === '') return;
    const body: IssueGatewayEnrollmentTokenRequest = {
      gatewayName: gatewayName.trim(),
      ...(ttlSeconds !== '' ? { ttlSeconds } : {}),
    };
    issue.mutate(body);
  };

  if (issued !== undefined) {
    return (
      <Dialog title="Enrollment token issued" onClose={onClose}>
        <SecretReveal value={issued.token} />
        <DetailList>
          <Detail label="Gateway">{issued.gatewayName}</Detail>
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
    <Dialog title="Issue Gateway enrollment token" onClose={onClose}>
      <p className="muted">
        Mints a short-lived, single-use token bound to one Gateway name. The raw
        token is shown once for out-of-band delivery to the Gateway being
        installed.
      </p>
      <TextField
        label="Gateway name"
        value={gatewayName}
        onChange={setGatewayName}
        required
        hint="The stable Gateway name the token authorises an enrollment as. Enrolling under any other name is refused."
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
          disabled={gatewayName.trim() === '' || issue.isPending}
        >
          {issue.isPending ? 'Issuing…' : 'Issue token'}
        </Button>
      </FormActions>
    </Dialog>
  );
}

export function RevokeGatewayEnrollmentTokenDialog({
  token,
  onClose,
}: {
  token: GatewayEnrollmentTokenResource;
  onClose: () => void;
}) {
  const revoke = useRevokeGatewayEnrollmentToken();
  return (
    <ConfirmDialog
      title={`Revoke enrollment token for ${token.gatewayName}`}
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
        Marks the unconsumed token consumed so it can never be used. Revoking an
        already-used token does not affect the Gateway identity it produced —
        revoking that is a Lock. Idempotent.
      </p>
    </ConfirmDialog>
  );
}
