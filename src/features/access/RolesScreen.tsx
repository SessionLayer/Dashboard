import { useState } from 'react';

import {
  Button,
  ConfirmDialog,
  Detail,
  DetailList,
  Dialog,
  EnumMultiField,
  FormActions,
  PageHeader,
  TextField,
  TextareaField,
  Time,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { PlatformPermission, RoleResource } from '../../api/types';
import { CrudList, MutationError, OriginBadge } from './common';
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole } from './hooks';

const PERMISSION_OPTIONS: readonly {
  value: PlatformPermission;
  label: string;
}[] = [
  { value: 'rbac:read', label: 'rbac:read' },
  { value: 'rbac:write', label: 'rbac:write' },
  { value: 'node:enroll', label: 'node:enroll' },
  { value: 'node:quarantine', label: 'node:quarantine' },
  { value: 'node:remove', label: 'node:remove' },
  { value: 'ca:manage', label: 'ca:manage' },
  { value: 'ca:rotate', label: 'ca:rotate' },
  { value: 'request:approve', label: 'request:approve' },
  { value: 'recording:replay', label: 'recording:replay' },
  { value: 'recording:export', label: 'recording:export' },
  { value: 'recording:delete', label: 'recording:delete' },
  { value: 'audit:read', label: 'audit:read' },
  { value: 'user:manage', label: 'user:manage' },
  { value: 'settings:write', label: 'settings:write' },
  { value: 'lock:read', label: 'lock:read' },
  { value: 'lock:write', label: 'lock:write' },
  { value: 'breakglass:manage', label: 'breakglass:manage' },
];

type Dialog =
  | { kind: 'create' }
  | { kind: 'detail'; row: RoleResource }
  | { kind: 'edit'; row: RoleResource }
  | { kind: 'delete'; row: RoleResource };

function RoleForm({
  existing,
  onDone,
}: {
  existing?: RoleResource;
  onDone: () => void;
}) {
  const create = useCreateRole();
  const update = useUpdateRole();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [permissions, setPermissions] = useState<PlatformPermission[]>(
    existing?.permissions ?? [],
  );

  const pending = create.isPending || update.isPending;

  const submit = () => {
    const trimmedDescription =
      description.trim() === '' ? undefined : description;
    if (existing) {
      update.mutate(
        {
          id: existing.id,
          body: {
            permissions,
            description: trimmedDescription,
            version: existing.version,
          },
        },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        { name, permissions, description: trimmedDescription },
        { onSuccess: onDone },
      );
    }
  };

  return (
    <div className="form">
      {existing === undefined && (
        <TextField label="Name" value={name} onChange={setName} required />
      )}
      <TextareaField
        label="Description"
        value={description}
        onChange={setDescription}
        rows={2}
      />
      <EnumMultiField
        label="Permissions"
        options={PERMISSION_OPTIONS}
        values={permissions}
        onChange={setPermissions}
        hint="The closed platform-permission vocabulary."
      />
      <MutationError error={existing ? update.error : create.error} />
      <FormActions>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Create role'}
        </Button>
      </FormActions>
    </div>
  );
}

function RoleDetail({ row }: { row: RoleResource }) {
  return (
    <DetailList>
      <Detail label="Name">{row.name}</Detail>
      <Detail label="Description">
        {row.description !== undefined && row.description !== ''
          ? row.description
          : '—'}
      </Detail>
      <Detail label="Permissions">
        {row.permissions.length > 0 ? row.permissions.join(', ') : '—'}
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
  );
}

export function RolesScreen() {
  const canWrite = useCan('rbac:write');
  const roles = useRoles();
  const del = useDeleteRole();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => {
    setDialog(null);
    del.reset();
  };

  const columns: Column<RoleResource>[] = [
    { header: 'Name', cell: (r) => r.name },
    {
      header: 'Permissions',
      cell: (r) => (r.permissions.length > 0 ? r.permissions.join(', ') : '—'),
    },
    {
      header: 'Description',
      cell: (r) =>
        r.description !== undefined && r.description !== ''
          ? r.description
          : '—',
    },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
    {
      header: 'Ver',
      cell: (r) => <span className="mono">v{r.version}</span>,
      align: 'right',
    },
  ];

  return (
    <section>
      <PageHeader
        title="Platform roles"
        description="Named sets of platform permissions bound to admin subjects."
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setDialog({ kind: 'create' });
              }}
            >
              New role…
            </Button>
          ) : undefined
        }
      />
      <CrudList
        list={roles}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Platform roles"
        emptyTitle="No roles yet"
        onRowClick={(row) => {
          setDialog({ kind: 'detail', row });
        }}
      />

      {dialog?.kind === 'create' && (
        <Dialog title="New role" onClose={close}>
          <RoleForm onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'edit' && (
        <Dialog title={`Edit role "${dialog.row.name}"`} onClose={close}>
          <RoleForm existing={dialog.row} onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'detail' && (
        <Dialog title={dialog.row.name} onClose={close}>
          <RoleDetail row={dialog.row} />
          {canWrite && (
            <FormActions>
              <Button
                onClick={() => {
                  setDialog({ kind: 'edit', row: dialog.row });
                }}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDialog({ kind: 'delete', row: dialog.row });
                }}
              >
                Delete
              </Button>
            </FormActions>
          )}
        </Dialog>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete role "${dialog.row.name}"?`}
          confirmLabel="Delete"
          pending={del.isPending}
          error={del.error}
          onConfirm={() => {
            del.mutate(dialog.row.id, { onSuccess: close });
          }}
          onClose={close}
        >
          <p>Deleting a role cascades and removes its bindings.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
