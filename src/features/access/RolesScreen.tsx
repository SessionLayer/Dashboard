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

// A Record rather than an array of options: the type then requires an entry for
// every member of the closed vocabulary, so a permission added to the contract
// fails the build here instead of silently becoming ungrantable. Key order is the
// contract's own and is the order the checkbox grid presents.
const PERMISSION_LABELS: Record<PlatformPermission, string> = {
  'rbac:read': 'rbac:read',
  'rbac:write': 'rbac:write',
  'node:enroll': 'node:enroll',
  'node:quarantine': 'node:quarantine',
  'node:remove': 'node:remove',
  'gateway:enroll': 'gateway:enroll',
  'gateway:remove': 'gateway:remove',
  'ca:manage': 'ca:manage',
  'ca:rotate': 'ca:rotate',
  'request:approve': 'request:approve',
  'recording:replay': 'recording:replay',
  'recording:export': 'recording:export',
  'recording:delete': 'recording:delete',
  'recording:key-manage': 'recording:key-manage',
  'audit:read': 'audit:read',
  'metrics:read': 'metrics:read',
  'user:manage': 'user:manage',
  'settings:write': 'settings:write',
  'lock:read': 'lock:read',
  'lock:write': 'lock:write',
  'breakglass:manage': 'breakglass:manage',
};

const PERMISSION_OPTIONS: readonly {
  value: PlatformPermission;
  label: string;
}[] = (Object.keys(PERMISSION_LABELS) as PlatformPermission[]).map((value) => ({
  value,
  label: PERMISSION_LABELS[value],
}));

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
