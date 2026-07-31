import { useState } from 'react';

import {
  AsyncList,
  Button,
  DataTable,
  PageHeader,
  Time,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { GatewayEnrollmentTokenResource } from '../../api/types';
import { useGatewayEnrollmentTokens } from './api';
import {
  IssueGatewayEnrollmentTokenDialog,
  RevokeGatewayEnrollmentTokenDialog,
} from './GatewayEnrollmentTokenDialogs';
import { MtlsTrustAnchorPanel } from './MtlsTrustAnchorPanel';

type Dialog =
  | { kind: 'issue' }
  | { kind: 'revoke'; token: GatewayEnrollmentTokenResource }
  | null;

export function GatewayEnrollmentTokenList() {
  const { data, isPending, isError, error } = useGatewayEnrollmentTokens();
  const canEnroll = useCan('gateway:enroll');
  const [dialog, setDialog] = useState<Dialog>(null);

  const tokens = data ?? [];

  const columns: Column<GatewayEnrollmentTokenResource>[] = [
    { header: 'Gateway', cell: (t) => t.gatewayName },
    {
      header: 'Single use',
      cell: (t) => (t.singleUse ? 'Yes' : 'No'),
    },
    { header: 'Expires', cell: (t) => <Time value={t.expiresAt} /> },
    { header: 'Issued', cell: (t) => <Time value={t.createdAt} /> },
    {
      header: 'Issued by',
      cell: (t) => t.createdBy ?? <span className="muted">—</span>,
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (t) =>
        canEnroll ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setDialog({ kind: 'revoke', token: t });
            }}
          >
            Revoke
          </Button>
        ) : null,
    },
  ];

  const close = () => {
    setDialog(null);
  };

  return (
    <section>
      <PageHeader
        title="Gateway enrollment"
        description="Active, unconsumed Gateway enrollment tokens (metadata only — the raw token is shown once at issuance)."
        actions={
          canEnroll ? (
            <Button
              variant="primary"
              onClick={() => {
                setDialog({ kind: 'issue' });
              }}
            >
              Issue token…
            </Button>
          ) : undefined
        }
      />

      <AsyncList
        isPending={isPending}
        isError={isError}
        error={error}
        isEmpty={tokens.length === 0}
        emptyTitle="No active enrollment tokens."
      >
        <DataTable
          caption="Active Gateway enrollment tokens"
          columns={columns}
          rows={tokens}
          rowKey={(t) => t.id}
        />
      </AsyncList>

      {canEnroll && <MtlsTrustAnchorPanel />}

      {dialog?.kind === 'issue' && (
        <IssueGatewayEnrollmentTokenDialog onClose={close} />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeGatewayEnrollmentTokenDialog
          token={dialog.token}
          onClose={close}
        />
      )}
    </section>
  );
}
