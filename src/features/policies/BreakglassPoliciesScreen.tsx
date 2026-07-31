import { useState } from 'react';

import {
  Dialog,
  ConfirmDialog,
  Button,
  Badge,
  DetailList,
  Detail,
  Time,
  TextField,
  SelectField,
  CheckboxField,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type {
  BreakglassAuthPath,
  BreakglassPolicyResource,
} from '../../api/types';
import { CrudScreen, OriginBadge, FormDialog } from './common';
import { AUTH_PATH_OPTIONS } from './helpers';
import {
  useBreakglassPolicies,
  useCreateBreakglassPolicy,
  useUpdateBreakglassPolicy,
  useDeleteBreakglassPolicy,
} from './hooks';

const PERM = 'breakglass:manage';

function yesNo(value: boolean) {
  return value ? (
    <Badge tone="pass">Yes</Badge>
  ) : (
    <Badge tone="neutral">No</Badge>
  );
}

type View =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'detail'; row: BreakglassPolicyResource }
  | { kind: 'edit'; row: BreakglassPolicyResource }
  | { kind: 'delete'; row: BreakglassPolicyResource };

export function BreakglassPoliciesScreen() {
  const canWrite = useCan(PERM);
  const list = useBreakglassPolicies();
  const [view, setView] = useState<View>({ kind: 'none' });

  const columns: Column<BreakglassPolicyResource>[] = [
    { header: 'Name', cell: (r) => r.name },
    { header: 'Alert target', cell: (r) => r.alertTarget },
    {
      header: 'Auth path',
      cell: (r) => <Badge tone="info">{r.authPath}</Badge>,
    },
    { header: 'Recording-strict', cell: (r) => yesNo(r.recordingStrict) },
    { header: 'Review required', cell: (r) => yesNo(r.reviewRequired) },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
    { header: 'Version', cell: (r) => r.version, align: 'right' },
  ];

  return (
    <>
      <CrudScreen
        title="Break-glass policies"
        description="Emergency-access paths: recording-strict, alert target, review, and IdP-independent auth (FR-ACC-6)."
        newLabel="New break-glass policy…"
        canWrite={canWrite}
        onNew={() => {
          setView({ kind: 'new' });
        }}
        list={list}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Break-glass policies"
        emptyTitle="No break-glass policies yet."
        onRowClick={(row) => {
          setView({ kind: 'detail', row });
        }}
      />

      {view.kind === 'detail' && (
        <BreakglassDetail
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
        <BreakglassForm
          resource={view.kind === 'edit' ? view.row : undefined}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}

      {view.kind === 'delete' && (
        <BreakglassDelete
          row={view.row}
          onClose={() => {
            setView({ kind: 'none' });
          }}
        />
      )}
    </>
  );
}

function BreakglassDetail({
  row,
  canWrite,
  onEdit,
  onDelete,
  onClose,
}: {
  row: BreakglassPolicyResource;
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
        <Detail label="Auth path">
          <Badge tone="info">{row.authPath}</Badge>
        </Detail>
        <Detail label="Alert target">{row.alertTarget}</Detail>
        <Detail label="Recording-strict">{yesNo(row.recordingStrict)}</Detail>
        <Detail label="Review required">{yesNo(row.reviewRequired)}</Detail>
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

function BreakglassForm({
  resource,
  onClose,
}: {
  resource?: BreakglassPolicyResource;
  onClose: () => void;
}) {
  const editing = resource !== undefined;
  const create = useCreateBreakglassPolicy();
  const update = useUpdateBreakglassPolicy();
  const mutation = editing ? update : create;

  const [name, setName] = useState(resource?.name ?? '');
  const [alertTarget, setAlertTarget] = useState(resource?.alertTarget ?? '');
  const [authPath, setAuthPath] = useState<BreakglassAuthPath>(
    resource?.authPath ?? 'fido2',
  );
  const [recordingStrict, setRecordingStrict] = useState(
    resource?.recordingStrict ?? true,
  );
  const [reviewRequired, setReviewRequired] = useState(
    resource?.reviewRequired ?? true,
  );

  const nameValid = editing || name.trim() !== '';
  const valid = nameValid && alertTarget.trim() !== '';

  const submit = () => {
    const shared = { recordingStrict, alertTarget, reviewRequired, authPath };
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
      title={editing ? 'Edit break-glass policy' : 'New break-glass policy'}
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
      <TextField
        label="Alert target"
        required
        value={alertTarget}
        onChange={setAlertTarget}
        hint="Where a break-glass activation raises an alert (e.g. a channel or address)."
      />
      <SelectField
        label="Auth path"
        required
        value={authPath}
        onChange={setAuthPath}
        options={AUTH_PATH_OPTIONS}
        hint="IdP-independent authentication used to break glass."
      />
      <CheckboxField
        label="Recording-strict (abort if session cannot be recorded)"
        checked={recordingStrict}
        onChange={setRecordingStrict}
      />
      <CheckboxField
        label="Review required after activation"
        checked={reviewRequired}
        onChange={setReviewRequired}
      />
    </FormDialog>
  );
}

function BreakglassDelete({
  row,
  onClose,
}: {
  row: BreakglassPolicyResource;
  onClose: () => void;
}) {
  const del = useDeleteBreakglassPolicy();
  return (
    <ConfirmDialog
      title={`Delete break-glass policy “${row.name}”?`}
      confirmLabel="Delete"
      pending={del.isPending}
      error={del.error}
      onConfirm={() => {
        del.mutate(row.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p>Removes this break-glass policy. Existing sessions are unaffected.</p>
    </ConfirmDialog>
  );
}
