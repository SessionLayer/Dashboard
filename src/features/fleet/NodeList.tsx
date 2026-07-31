import { useState } from 'react';

import {
  AsyncList,
  Button,
  DataTable,
  LabelMapView,
  PageHeader,
  Time,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { NodeResource } from '../../api/types';
import { ConnectorBadge, NodeHealthBadge, NodeStatusBadge } from './badges';
import { useNodes } from './api';
import { NodeDetailDialog } from './NodeDetailDialog';
import { RegisterNodeDialog } from './RegisterNodeDialog';
import { QuarantineNodeDialog } from './QuarantineNodeDialog';
import { ReleaseQuarantineDialog, RemoveNodeDialog } from './NodeActionDialogs';

type Dialog =
  | { kind: 'register' }
  | { kind: 'detail'; nodeId: string }
  | { kind: 'quarantine'; node: NodeResource }
  | { kind: 'release'; node: NodeResource }
  | { kind: 'remove'; node: NodeResource }
  | null;

export function NodeList() {
  const { data, isPending, isError, error } = useNodes();
  const canEnroll = useCan('node:enroll');
  const canQuarantine = useCan('node:quarantine');
  const canRemove = useCan('node:remove');
  const [dialog, setDialog] = useState<Dialog>(null);

  const nodes = data ?? [];

  const columns: Column<NodeResource>[] = [
    {
      header: 'Name',
      cell: (n) => (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setDialog({ kind: 'detail', nodeId: n.id });
          }}
        >
          {n.name}
        </button>
      ),
    },
    {
      header: 'Connector',
      cell: (n) => <ConnectorBadge kind={n.connectorKind} />,
    },
    { header: 'Labels', cell: (n) => <LabelMapView labels={n.labels} /> },
    { header: 'Status', cell: (n) => <NodeStatusBadge status={n.status} /> },
    { header: 'Health', cell: (n) => <NodeHealthBadge health={n.health} /> },
    {
      // No heartbeat/liveness telemetry exists in the contract (NodeResource
      // has no lastSeenAt) — `updatedAt` (last record mutation) is the closest
      // honest proxy for the mockup's "Last seen" column.
      header: 'Last seen',
      cell: (n) => <Time value={n.updatedAt} />,
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (n) => {
        const active = n.status !== 'removed';
        return (
          <div className="row-actions">
            {canQuarantine && active && n.status !== 'quarantined' && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setDialog({ kind: 'quarantine', node: n });
                }}
              >
                Quarantine
              </Button>
            )}
            {canQuarantine && n.status === 'quarantined' && (
              <Button
                size="sm"
                onClick={() => {
                  setDialog({ kind: 'release', node: n });
                }}
              >
                Release
              </Button>
            )}
            {canRemove && active && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDialog({ kind: 'remove', node: n });
                }}
              >
                Remove
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const close = () => {
    setDialog(null);
  };

  return (
    <section>
      <PageHeader
        title="Nodes"
        description="Enrolled nodes, their connectivity model, lifecycle status, and health."
        actions={
          canEnroll ? (
            <Button
              variant="primary"
              onClick={() => {
                setDialog({ kind: 'register' });
              }}
            >
              Register node…
            </Button>
          ) : undefined
        }
      />

      <AsyncList
        isPending={isPending}
        isError={isError}
        error={error}
        isEmpty={nodes.length === 0}
        emptyTitle="No nodes enrolled."
      >
        <DataTable
          caption="Enrolled nodes"
          columns={columns}
          rows={nodes}
          rowKey={(n) => n.id}
        />
      </AsyncList>

      {dialog?.kind === 'register' && <RegisterNodeDialog onClose={close} />}
      {dialog?.kind === 'detail' && (
        <NodeDetailDialog nodeId={dialog.nodeId} onClose={close} />
      )}
      {dialog?.kind === 'quarantine' && (
        <QuarantineNodeDialog node={dialog.node} onClose={close} />
      )}
      {dialog?.kind === 'release' && (
        <ReleaseQuarantineDialog node={dialog.node} onClose={close} />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveNodeDialog node={dialog.node} onClose={close} />
      )}
    </section>
  );
}
