import { useState } from 'react';

import {
  Dialog,
  ConfirmDialog,
  Button,
  DetailList,
  Detail,
  Time,
  SelectField,
  TextareaField,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { Capability, CapabilityDefResource } from '../../api/types';
import { CrudScreen, OriginBadge, FormDialog } from './common';
import { CAPABILITY_OPTIONS } from './helpers';
import {
  useCapabilityDefs,
  useCreateCapabilityDef,
  useUpdateCapabilityDef,
  useDeleteCapabilityDef,
} from './hooks';

const PERM = 'settings:write';

type View =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'detail'; row: CapabilityDefResource }
  | { kind: 'edit'; row: CapabilityDefResource }
  | { kind: 'delete'; row: CapabilityDefResource };

export function CapabilityDefsScreen() {
  const canWrite = useCan(PERM);
  const list = useCapabilityDefs();
  const [view, setView] = useState<View>({ kind: 'none' });

  const columns: Column<CapabilityDefResource>[] = [
    { header: 'Capability', cell: (r) => <code>{r.name}</code> },
    {
      header: 'Description',
      cell: (r) => r.description ?? <span className="muted">—</span>,
    },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
    { header: 'Version', cell: (r) => r.version, align: 'right' },
    { header: 'Updated', cell: (r) => <Time value={r.updatedAt} /> },
  ];

  return (
    <>
      <CrudScreen
        title="Capability catalogue"
        description="Which SSH channel capabilities are requestable (Design D14)."
        newLabel="New capability…"
        canWrite={canWrite}
        onNew={() => {
          setView({ kind: 'new' });
        }}
        list={list}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Requestable capability definitions"
        emptyTitle="No capability definitions yet."
        onRowClick={(row) => {
          setView({ kind: 'detail', row });
        }}
      />

      {view.kind === 'detail' && (
        <CapabilityDetail
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
        <CapabilityForm
          resource={view.kind === 'edit' ? view.row : undefined}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}

      {view.kind === 'delete' && (
        <CapabilityDelete
          row={view.row}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}
    </>
  );
}

function CapabilityDetail({
  row,
  canWrite,
  onEdit,
  onDelete,
  onClose,
}: {
  row: CapabilityDefResource;
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
        <Detail label="Capability">
          <code>{row.name}</code>
        </Detail>
        <Detail label="Description">
          {row.description ?? <span className="muted">—</span>}
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

function CapabilityForm({
  resource,
  onClose,
}: {
  resource?: CapabilityDefResource;
  onClose: () => void;
}) {
  const editing = resource !== undefined;
  const create = useCreateCapabilityDef();
  const update = useUpdateCapabilityDef();
  const mutation = editing ? update : create;

  const [name, setName] = useState<Capability>(resource?.name ?? 'shell');
  const [description, setDescription] = useState(resource?.description ?? '');

  const submit = () => {
    const desc = description.trim() === '' ? undefined : description;
    if (editing) {
      update.mutate(
        {
          id: resource.id,
          body: { description: desc, version: resource.version },
        },
        { onSuccess: onClose },
      );
    } else {
      create.mutate({ name, description: desc }, { onSuccess: onClose });
    }
  };

  return (
    <FormDialog
      title={editing ? 'Edit capability' : 'New capability'}
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={submit}
      onClose={onClose}
    >
      {editing ? (
        <DetailList>
          <Detail label="Capability">
            <code>{resource.name}</code>
          </Detail>
        </DetailList>
      ) : (
        <SelectField
          label="Capability"
          required
          value={name}
          onChange={setName}
          options={CAPABILITY_OPTIONS}
          hint="From the closed capability set; a name outside it is rejected."
        />
      )}
      <TextareaField
        label="Description"
        value={description}
        onChange={setDescription}
        rows={3}
      />
    </FormDialog>
  );
}

function CapabilityDelete({
  row,
  onClose,
}: {
  row: CapabilityDefResource;
  onClose: () => void;
}) {
  const del = useDeleteCapabilityDef();
  return (
    <ConfirmDialog
      title={`Delete capability “${row.name}”?`}
      confirmLabel="Delete"
      pending={del.isPending}
      error={del.error}
      onConfirm={() => {
        del.mutate(row.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p>
        Removes this capability from the requestable catalogue. Existing
        sessions are unaffected.
      </p>
    </ConfirmDialog>
  );
}
