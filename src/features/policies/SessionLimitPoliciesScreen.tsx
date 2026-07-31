import { useState } from 'react';

import {
  Dialog,
  ConfirmDialog,
  Button,
  DetailList,
  Detail,
  CodeBlock,
  Time,
  TextField,
  NumberField,
  JsonField,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { SessionLimitPolicyResource } from '../../api/types';
import { CrudScreen, OriginBadge, FormDialog, SelectorSummary } from './common';
import { parseJsonState, toJsonText } from './helpers';
import {
  useSessionLimitPolicies,
  useCreateSessionLimitPolicy,
  useUpdateSessionLimitPolicy,
  useDeleteSessionLimitPolicy,
} from './hooks';

const PERM = 'settings:write';

/** A knob's cell: the override value, or the honest "deferred to default" state. */
function knobCell(value: number | undefined) {
  return value ?? <span className="muted">cluster default</span>;
}

type View =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'detail'; row: SessionLimitPolicyResource }
  | { kind: 'edit'; row: SessionLimitPolicyResource }
  | { kind: 'delete'; row: SessionLimitPolicyResource };

export function SessionLimitPoliciesScreen() {
  const canWrite = useCan(PERM);
  const list = useSessionLimitPolicies();
  const [view, setView] = useState<View>({ kind: 'none' });

  const columns: Column<SessionLimitPolicyResource>[] = [
    { header: 'Name', cell: (r) => r.name },
    {
      header: 'Identity selector',
      cell: (r) => <SelectorSummary selector={r.identitySelector} />,
    },
    {
      header: 'Max concurrent sessions',
      cell: (r) => knobCell(r.maxConcurrentSessions),
      align: 'right',
    },
    {
      header: 'Max session duration (s)',
      cell: (r) => knobCell(r.maxSessionSeconds),
      align: 'right',
    },
    {
      header: 'Idle timeout (s)',
      cell: (r) => knobCell(r.idleTimeoutSeconds),
      align: 'right',
    },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
    { header: 'Version', cell: (r) => r.version, align: 'right' },
  ];

  return (
    <>
      <CrudScreen
        title="Session-limit policies"
        description="Per-identity overrides for the concurrent-session cap, max session duration, and idle timeout (FR-SESS-3). The most restrictive matching value wins per knob; an absent knob defers to the cluster default."
        newLabel="New session-limit policy…"
        canWrite={canWrite}
        onNew={() => {
          setView({ kind: 'new' });
        }}
        list={list}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Session-limit policies"
        emptyTitle="No session-limit policies yet."
        onRowClick={(row) => {
          setView({ kind: 'detail', row });
        }}
      />

      {view.kind === 'detail' && (
        <SessionLimitPolicyDetail
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
        <SessionLimitPolicyForm
          resource={view.kind === 'edit' ? view.row : undefined}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}

      {view.kind === 'delete' && (
        <SessionLimitPolicyDelete
          row={view.row}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}
    </>
  );
}

function SessionLimitPolicyDetail({
  row,
  canWrite,
  onEdit,
  onDelete,
  onClose,
}: {
  row: SessionLimitPolicyResource;
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
        <Detail label="Identity selector">
          <CodeBlock value={row.identitySelector} />
        </Detail>
        <Detail label="Max concurrent sessions">
          {knobCell(row.maxConcurrentSessions)}
        </Detail>
        <Detail label="Max session duration (seconds)">
          {knobCell(row.maxSessionSeconds)}
        </Detail>
        <Detail label="Idle timeout (seconds)">
          {knobCell(row.idleTimeoutSeconds)}
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

function SessionLimitPolicyForm({
  resource,
  onClose,
}: {
  resource?: SessionLimitPolicyResource;
  onClose: () => void;
}) {
  const editing = resource !== undefined;
  const create = useCreateSessionLimitPolicy();
  const update = useUpdateSessionLimitPolicy();
  const mutation = editing ? update : create;

  const [name, setName] = useState(resource?.name ?? '');
  const [selectorText, setSelectorText] = useState(
    toJsonText(resource?.identitySelector) === ''
      ? '{}'
      : toJsonText(resource?.identitySelector),
  );
  const [maxConcurrent, setMaxConcurrent] = useState<number | ''>(
    resource?.maxConcurrentSessions ?? '',
  );
  const [maxSeconds, setMaxSeconds] = useState<number | ''>(
    resource?.maxSessionSeconds ?? '',
  );
  const [idleSeconds, setIdleSeconds] = useState<number | ''>(
    resource?.idleTimeoutSeconds ?? '',
  );

  const selector = parseJsonState(selectorText);
  const nameValid = editing || name.trim() !== '';
  const selectorValid = selector.ok && selector.value !== undefined;
  const atLeastOneKnob =
    maxConcurrent !== '' || maxSeconds !== '' || idleSeconds !== '';
  const valid = nameValid && selectorValid && atLeastOneKnob;

  const submit = () => {
    if (selector.value === undefined) return;
    const shared = {
      identitySelector: selector.value,
      maxConcurrentSessions: maxConcurrent === '' ? undefined : maxConcurrent,
      maxSessionSeconds: maxSeconds === '' ? undefined : maxSeconds,
      idleTimeoutSeconds: idleSeconds === '' ? undefined : idleSeconds,
    };
    if (editing) {
      update.mutate(
        { id: resource.id, body: { ...shared, version: resource.version } },
        { onSuccess: onClose },
      );
    } else {
      create.mutate({ name, ...shared }, { onSuccess: onClose });
    }
  };

  return (
    <FormDialog
      title={editing ? 'Edit session-limit policy' : 'New session-limit policy'}
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
      <JsonField
        label="Identity selector"
        required
        value={selectorText}
        onChange={setSelectorText}
        hint='A JSON selector object matched against the caller identity, e.g. {"team":"sre"}.'
      />
      <NumberField
        label="Max concurrent sessions"
        min={1}
        value={maxConcurrent}
        onChange={setMaxConcurrent}
        hint="Leave blank to defer to the operator_settings cluster default."
      />
      <NumberField
        label="Max session duration (seconds)"
        min={1}
        value={maxSeconds}
        onChange={setMaxSeconds}
        hint="Folded into the decision's grant expiry. Leave blank to defer to the cluster default."
      />
      <NumberField
        label="Idle timeout (seconds)"
        min={1}
        value={idleSeconds}
        onChange={setIdleSeconds}
        hint="Signed into the decision context and tighten-only enforced by the Gateway. Leave blank to defer to the cluster default."
      />
      {!atLeastOneKnob && (
        <p className="field-error error" role="alert">
          Set at least one of the three knobs above — a policy with all three
          absent is rejected.
        </p>
      )}
    </FormDialog>
  );
}

function SessionLimitPolicyDelete({
  row,
  onClose,
}: {
  row: SessionLimitPolicyResource;
  onClose: () => void;
}) {
  const del = useDeleteSessionLimitPolicy();
  return (
    <ConfirmDialog
      title={`Delete session-limit policy “${row.name}”?`}
      confirmLabel="Delete"
      pending={del.isPending}
      error={del.error}
      onConfirm={() => {
        del.mutate(row.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p>
        Removes this override. Matching identities fall back to any other
        matching policy, or the cluster default.
      </p>
    </ConfirmDialog>
  );
}
