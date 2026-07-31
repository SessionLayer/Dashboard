import { useState } from 'react';

import {
  Dialog,
  ConfirmDialog,
  Button,
  Badge,
  DetailList,
  Detail,
  LabelMapView,
  Time,
  TextField,
  SelectField,
  JsonField,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { LabelMap, NodePolicyResource } from '../../api/types';
import { CrudScreen, OriginBadge, FormDialog } from './common';
import { CONNECTOR_OPTIONS, parseJsonState, toJsonText } from './helpers';
import {
  useNodePolicies,
  useCreateNodePolicy,
  useUpdateNodePolicy,
  useDeleteNodePolicy,
} from './hooks';

const PERM = 'settings:write';

type View =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'detail'; row: NodePolicyResource }
  | { kind: 'edit'; row: NodePolicyResource }
  | { kind: 'delete'; row: NodePolicyResource };

export function NodePoliciesScreen() {
  const canWrite = useCan(PERM);
  const list = useNodePolicies();
  const [view, setView] = useState<View>({ kind: 'none' });

  const columns: Column<NodePolicyResource>[] = [
    { header: 'Name', cell: (r) => r.name },
    { header: 'Connector', cell: (r) => <Badge>{r.connectorKind}</Badge> },
    {
      header: 'Desired labels',
      cell: (r) => <LabelMapView labels={r.desiredLabels} />,
    },
    {
      header: 'Host trust',
      cell: (r) => {
        const refs = [r.hostPinRef, r.hostCaRef].filter(
          (v): v is string => v !== undefined && v !== '',
        );
        return refs.length > 0 ? (
          refs.join(' · ')
        ) : (
          <span className="muted">—</span>
        );
      },
    },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
    { header: 'Version', cell: (r) => r.version, align: 'right' },
    { header: 'Updated', cell: (r) => <Time value={r.updatedAt} /> },
  ];

  return (
    <>
      <CrudScreen
        title="Node policies"
        description="Desired labels, connector kind, and host-trust references (Design §12A)."
        newLabel="New node policy…"
        canWrite={canWrite}
        onNew={() => {
          setView({ kind: 'new' });
        }}
        list={list}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Node policies"
        emptyTitle="No node policies yet."
        onRowClick={(row) => {
          setView({ kind: 'detail', row });
        }}
      />

      {view.kind === 'detail' && (
        <NodePolicyDetail
          row={view.row}
          canWrite={canWrite}
          onEdit={() => {
            setView({ kind: 'edit', row: view.row });
          }}
          onDelete={() => {
            setView({ kind: 'delete', row: view.row });
          }}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}

      {(view.kind === 'new' || view.kind === 'edit') && (
        <NodePolicyForm
          resource={view.kind === 'edit' ? view.row : undefined}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}

      {view.kind === 'delete' && (
        <NodePolicyDelete
          row={view.row}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}
    </>
  );
}

function NodePolicyDetail({
  row,
  canWrite,
  onEdit,
  onDelete,
  onClose,
}: {
  row: NodePolicyResource;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={row.name}
      onClose={onClose}
      footer={
        canWrite ? (
          <>
            <Button onClick={onEdit}>Edit</Button>
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </>
        ) : undefined
      }
    >
      <DetailList>
        <Detail label="Name">{row.name}</Detail>
        <Detail label="Connector kind">
          <Badge>{row.connectorKind}</Badge>
        </Detail>
        <Detail label="Desired labels">
          <LabelMapView labels={row.desiredLabels} />
        </Detail>
        <Detail label="Host pin ref">
          {row.hostPinRef ?? <span className="muted">—</span>}
        </Detail>
        <Detail label="Host CA ref">
          {row.hostCaRef ?? <span className="muted">—</span>}
        </Detail>
        <Detail label="Origin">
          <OriginBadge origin={row.origin} />
        </Detail>
        <Detail label="Version">{row.version}</Detail>
        <Detail label="Created">
          <Time value={row.createdAt} />
        </Detail>
        <Detail label="Updated">
          <Time value={row.updatedAt} />
        </Detail>
      </DetailList>
    </Dialog>
  );
}

function NodePolicyForm({
  resource,
  onClose,
}: {
  resource?: NodePolicyResource;
  onClose: () => void;
}) {
  const editing = resource !== undefined;
  const create = useCreateNodePolicy();
  const update = useUpdateNodePolicy();
  const mutation = editing ? update : create;

  const [name, setName] = useState(resource?.name ?? '');
  const [connectorKind, setConnectorKind] = useState(
    resource?.connectorKind ?? 'agentless',
  );
  const [labelsText, setLabelsText] = useState(
    toJsonText(resource?.desiredLabels),
  );
  const [hostPinRef, setHostPinRef] = useState(resource?.hostPinRef ?? '');
  const [hostCaRef, setHostCaRef] = useState(resource?.hostCaRef ?? '');

  const labels = parseJsonState(labelsText);
  const nameValid = editing || name.trim() !== '';
  const valid = nameValid && labels.ok;

  const trimmed = (v: string) => (v.trim() === '' ? undefined : v);
  const desiredLabels =
    labels.value === undefined ? undefined : (labels.value as LabelMap);

  const submit = () => {
    if (editing) {
      update.mutate(
        {
          id: resource.id,
          body: {
            connectorKind,
            desiredLabels,
            hostPinRef: trimmed(hostPinRef),
            hostCaRef: trimmed(hostCaRef),
            version: resource.version,
          },
        },
        { onSuccess: onClose },
      );
    } else {
      create.mutate(
        {
          name,
          connectorKind,
          desiredLabels,
          hostPinRef: trimmed(hostPinRef),
          hostCaRef: trimmed(hostCaRef),
        },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <FormDialog
      title={editing ? 'Edit node policy' : 'New node policy'}
      pending={mutation.isPending}
      error={mutation.error}
      submitDisabled={!valid}
      onSubmit={submit}
      onClose={onClose}
    >
      {editing ? (
        <DetailList>
          <Detail label="Name">{resource.name}</Detail>
        </DetailList>
      ) : (
        <TextField label="Name" required value={name} onChange={setName} />
      )}
      <SelectField
        label="Connector kind"
        required
        value={connectorKind}
        onChange={setConnectorKind}
        options={CONNECTOR_OPTIONS}
      />
      <JsonField
        label="Desired labels"
        value={labelsText}
        onChange={setLabelsText}
        hint='A JSON object of string labels, e.g. {"env":"prod"}. Leave blank for none.'
      />
      <TextField
        label="Host pin ref"
        value={hostPinRef}
        onChange={setHostPinRef}
        hint="Reference to a host-key pin. Never a private key."
      />
      <TextField
        label="Host CA ref"
        value={hostCaRef}
        onChange={setHostCaRef}
        hint="Reference to a host CA trust anchor."
      />
    </FormDialog>
  );
}

function NodePolicyDelete({
  row,
  onClose,
}: {
  row: NodePolicyResource;
  onClose: () => void;
}) {
  const del = useDeleteNodePolicy();
  return (
    <ConfirmDialog
      title={`Delete node policy “${row.name}”?`}
      confirmLabel="Delete"
      pending={del.isPending}
      error={del.error}
      onConfirm={() => {
        del.mutate(row.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p>Removes this node policy. Existing sessions are unaffected.</p>
    </ConfirmDialog>
  );
}
