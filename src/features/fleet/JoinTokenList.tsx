import { useState } from 'react';

import {
  AsyncList,
  Badge,
  Button,
  DataTable,
  PageHeader,
  Time,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { JoinTokenResource } from '../../api/types';
import { useJoinTokens } from './api';
import {
  IssueJoinTokenDialog,
  RevokeJoinTokenDialog,
} from './JoinTokenDialogs';

type Dialog =
  { kind: 'issue' } | { kind: 'revoke'; token: JoinTokenResource } | null;

export function JoinTokenList() {
  const { data, isPending, isError, error } = useJoinTokens();
  const canEnroll = useCan('node:enroll');
  const [dialog, setDialog] = useState<Dialog>(null);

  const tokens = data ?? [];

  const columns: Column<JoinTokenResource>[] = [
    { header: 'Node', cell: (t) => t.nodeName },
    {
      header: 'Method',
      cell: (t) => <Badge tone="info">{t.joinMethod}</Badge>,
    },
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
        title="Join tokens"
        description="Active, unconsumed agent join tokens (metadata only — the raw token is shown once at issuance)."
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
        emptyTitle="No active join tokens."
      >
        <DataTable
          caption="Active join tokens"
          columns={columns}
          rows={tokens}
          rowKey={(t) => t.id}
        />
      </AsyncList>

      {dialog?.kind === 'issue' && <IssueJoinTokenDialog onClose={close} />}
      {dialog?.kind === 'revoke' && (
        <RevokeJoinTokenDialog token={dialog.token} onClose={close} />
      )}
    </section>
  );
}
