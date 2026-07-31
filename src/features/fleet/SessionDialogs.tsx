import { useState } from 'react';

import {
  ConfirmDialog,
  Detail,
  DetailList,
  Dialog,
  LoadingState,
  ProblemAlert,
  TextareaField,
  Time,
} from '../../ui';
import type { SessionResource } from '../../api/types';
import { AccessModelBadge, CapabilityBadges } from './badges';
import { useSession, useTerminateSession } from './api';

export function SessionDetailDialog({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const { data: s, isPending, isError, error } = useSession(sessionId);

  return (
    <Dialog title="Session detail" onClose={onClose}>
      {isPending ? (
        <LoadingState />
      ) : isError ? (
        <ProblemAlert error={error} />
      ) : (
        <DetailList>
          <Detail label="Identity">{s.identity}</Detail>
          <Detail label="Node">
            {s.nodeName ?? <span className="muted">—</span>}
          </Detail>
          <Detail label="Principal">{s.principal}</Detail>
          <Detail label="Gateway">
            {s.gatewayName ?? <span className="muted">—</span>}
          </Detail>
          <Detail label="Access model">
            <AccessModelBadge model={s.accessModel} />
          </Detail>
          <Detail label="Capabilities">
            <CapabilityBadges caps={s.capabilities} />
          </Detail>
          <Detail label="Matched rule">
            {s.matchedRuleName ?? <span className="muted">—</span>}
          </Detail>
          <Detail label="Grant expiry">
            <Time value={s.grantExpiry} />
          </Detail>
          <Detail label="Started">
            <Time value={s.startedAt} />
          </Detail>
          <Detail label="Ended">
            <Time value={s.endedAt} />
          </Detail>
          <Detail label="End reason">
            {s.endReason ?? <span className="muted">—</span>}
          </Detail>
          <Detail label="ID">
            <code>{s.id}</code>
          </Detail>
        </DetailList>
      )}
    </Dialog>
  );
}

export function TerminateSessionDialog({
  session,
  onClose,
}: {
  session: SessionResource;
  onClose: () => void;
}) {
  const terminate = useTerminateSession();
  const [reason, setReason] = useState('');

  return (
    <ConfirmDialog
      title={`Terminate ${session.identity}'s session`}
      confirmLabel="Terminate"
      variant="danger"
      pending={terminate.isPending}
      error={terminate.isError ? terminate.error : undefined}
      onConfirm={() => {
        terminate.mutate(
          {
            sessionId: session.id,
            body: reason.trim() !== '' ? { reason: reason.trim() } : {},
          },
          { onSuccess: onClose },
        );
      }}
      onClose={onClose}
    >
      <p className="muted">
        Pushes a short-lived, identity-scoped teardown lock to every Gateway
        (fail-closed). It also affects that identity&apos;s other live sessions
        and expires so they may reconnect under unchanged policy.
      </p>
      <TextareaField
        label="Reason"
        value={reason}
        onChange={setReason}
        rows={2}
        hint="Optional operator/audit reason (never disclosed to the SSH user)."
      />
    </ConfirmDialog>
  );
}
