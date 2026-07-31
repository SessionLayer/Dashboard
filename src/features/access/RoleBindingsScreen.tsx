import { useState } from 'react';

import {
  Badge,
  Button,
  CodeBlock,
  ConfirmDialog,
  Detail,
  DetailList,
  Dialog,
  FormActions,
  JsonField,
  PageHeader,
  SelectField,
  TextField,
  Time,
  parseJsonObject,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { RoleBindingResource, SubjectKind } from '../../api/types';
import { CrudList, MutationError, OriginBadge, jsonText } from './common';
import {
  useCreateRoleBinding,
  useDeleteRoleBinding,
  useRoleBindings,
  useRoles,
  useUpdateRoleBinding,
} from './hooks';

const SUBJECT_KIND_OPTIONS: readonly { value: SubjectKind; label: string }[] = [
  { value: 'user', label: 'user' },
  { value: 'group', label: 'group' },
];

/** A compact `k=v k2=v2` summary of the scope selector for the list column. */
function scopeSummary(scope: Record<string, unknown> | undefined): string {
  if (scope === undefined) return 'global';
  const entries = Object.entries(scope);
  if (entries.length === 0) return 'global';
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(' ');
}

type Dialog =
  | { kind: 'create' }
  | { kind: 'detail'; row: RoleBindingResource }
  | { kind: 'edit'; row: RoleBindingResource }
  | { kind: 'delete'; row: RoleBindingResource };

function CreateBindingForm({ onDone }: { onDone: () => void }) {
  const create = useCreateRoleBinding();
  const roles = useRoles();
  const roleOptions = roles.items.map((r) => ({ value: r.id, label: r.name }));
  const [roleId, setRoleId] = useState('');
  const [subjectKind, setSubjectKind] = useState<SubjectKind>('user');
  const [subject, setSubject] = useState('');
  const [scope, setScope] = useState('');
  const [formError, setFormError] = useState<string>();

  const submit = () => {
    let parsedScope: Record<string, unknown> | undefined;
    try {
      parsedScope = parseJsonObject(scope);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Invalid JSON scope');
      return;
    }
    setFormError(undefined);
    create.mutate(
      { roleId, subjectKind, subject, scope: parsedScope },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="form">
      {roleOptions.length > 0 ? (
        <SelectField
          label="Role"
          value={roleId}
          onChange={setRoleId}
          options={[{ value: '', label: 'Select a role…' }, ...roleOptions]}
          required
        />
      ) : (
        <TextField
          label="Role ID"
          value={roleId}
          onChange={setRoleId}
          required
          hint="The UUID of the platform role to bind."
        />
      )}
      <SelectField
        label="Subject kind"
        value={subjectKind}
        onChange={setSubjectKind}
        options={SUBJECT_KIND_OPTIONS}
        required
      />
      <TextField
        label="Subject"
        value={subject}
        onChange={setSubject}
        required
        hint="The user or group identifier."
      />
      <JsonField
        label="Scope"
        value={scope}
        onChange={setScope}
        hint="Optional selector limiting recording:replay/export; empty for unscoped."
      />
      {formError !== undefined && (
        <p className="field-error error" role="alert">
          {formError}
        </p>
      )}
      <MutationError error={create.error} />
      <FormActions>
        <Button variant="ghost" onClick={onDone} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Create binding'}
        </Button>
      </FormActions>
    </div>
  );
}

function EditBindingForm({
  existing,
  onDone,
}: {
  existing: RoleBindingResource;
  onDone: () => void;
}) {
  const update = useUpdateRoleBinding();
  const [scope, setScope] = useState(jsonText(existing.scope));
  const [formError, setFormError] = useState<string>();

  const submit = () => {
    let parsedScope: Record<string, unknown> | undefined;
    try {
      parsedScope = parseJsonObject(scope);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Invalid JSON scope');
      return;
    }
    setFormError(undefined);
    update.mutate(
      {
        id: existing.id,
        body: { scope: parsedScope, version: existing.version },
      },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="form">
      <p className="muted">
        Only the scope is editable; the role and subject are immutable.
      </p>
      <JsonField
        label="Scope"
        value={scope}
        onChange={setScope}
        hint="Optional selector; empty for unscoped."
      />
      {formError !== undefined && (
        <p className="field-error error" role="alert">
          {formError}
        </p>
      )}
      <MutationError error={update.error} />
      <FormActions>
        <Button variant="ghost" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </FormActions>
    </div>
  );
}

function BindingDetail({ row }: { row: RoleBindingResource }) {
  return (
    <DetailList>
      <Detail label="Role ID">{row.roleId}</Detail>
      <Detail label="Subject kind">
        <Badge tone="info">{row.subjectKind}</Badge>
      </Detail>
      <Detail label="Subject">{row.subject}</Detail>
      <Detail label="Scope">
        <CodeBlock value={row.scope} />
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

export function RoleBindingsScreen() {
  const canWrite = useCan('rbac:write');
  const bindings = useRoleBindings();
  const del = useDeleteRoleBinding();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => {
    setDialog(null);
    del.reset();
  };

  const columns: Column<RoleBindingResource>[] = [
    {
      header: 'Subject',
      cell: (r) => (
        <>
          <Badge tone="info">{r.subjectKind}</Badge> {r.subject}
        </>
      ),
    },
    { header: 'Role ID', cell: (r) => r.roleId },
    {
      header: 'Scope',
      cell: (r) => <span className="mono">{scopeSummary(r.scope)}</span>,
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
        title="Role bindings"
        description="Bind users and groups to platform roles."
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setDialog({ kind: 'create' });
              }}
            >
              New binding…
            </Button>
          ) : undefined
        }
      />
      <CrudList
        list={bindings}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Role bindings"
        emptyTitle="No role bindings yet"
        onRowClick={(row) => {
          setDialog({ kind: 'detail', row });
        }}
      />

      {dialog?.kind === 'create' && (
        <Dialog title="New role binding" onClose={close}>
          <CreateBindingForm onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'edit' && (
        <Dialog title="Edit role binding" onClose={close}>
          <EditBindingForm existing={dialog.row} onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'detail' && (
        <Dialog title="Role binding" onClose={close}>
          <BindingDetail row={dialog.row} />
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
          title="Delete this role binding?"
          confirmLabel="Delete"
          pending={del.isPending}
          error={del.error}
          onConfirm={() => {
            del.mutate(dialog.row.id, { onSuccess: close });
          }}
          onClose={close}
        >
          <p>
            The subject loses the permissions this role grants (unless granted
            by another binding).
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
