import { useState } from 'react';

import {
  Badge,
  Button,
  ConfirmDialog,
  Detail,
  DetailList,
  Dialog,
  FormActions,
  PageHeader,
  ProblemAlert,
  SelectField,
  TextField,
  Time,
  type BadgeTone,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type {
  CaAlgorithm,
  CaBackend,
  CaKind,
  CaResource,
  CaRotationState,
} from '../../api/types';
import { CaPublicKeyPanel } from './CaPublicKeyPanel';
import { CrudList, MutationError, OriginBadge } from './common';
import {
  useCas,
  useCreateCa,
  useDeleteCa,
  useRotateCa,
  useUpdateCa,
} from './hooks';

const CA_KIND_OPTIONS: readonly { value: CaKind; label: string }[] = [
  { value: 'user', label: 'user' },
  { value: 'session', label: 'session' },
  { value: 'host', label: 'host' },
];

const CA_BACKEND_OPTIONS: readonly { value: CaBackend; label: string }[] = [
  { value: 'local', label: 'local' },
  { value: 'aws_kms', label: 'aws_kms — no signer in this build' },
  { value: 'azure_keyvault', label: 'azure_keyvault' },
  { value: 'vault', label: 'vault — no signer in this build' },
];

const BACKEND_HINT =
  'Only local and azure_keyvault have a signer in this build; aws_kms and vault are integration seams with no implementation of their own — picking one is accepted here but rejected by the server (422). All four stay listed because an existing CA, carried from an older deployment, may already be configured with one.';

/**
 * Shape-only check for a Key Vault key identifier
 * (`https://<vault>/keys/<name>/<version>`). The Control Plane is the authority
 * on the exact rule (including the vault allow-list, which this UI has no way
 * to know) — this exists only to catch an obviously wrong reference before a
 * round trip, not to replace the server's `422`.
 */
function looksLikeVersionedKeyVaultReference(ref: string): boolean {
  let url: URL;
  try {
    url = new URL(ref);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    return false;
  }
  const [kind, name, version, extra] = url.pathname
    .split('/')
    .filter((s) => s !== '');
  if (
    kind !== 'keys' ||
    name === undefined ||
    version === undefined ||
    extra !== undefined
  ) {
    return false;
  }
  return name !== '.' && name !== '..' && version !== '.' && version !== '..';
}

/** Client-side hint only; the server's own `422` message is what's authoritative. */
function azureKeyReferenceError(
  backend: CaBackend,
  keyReference: string,
): string | undefined {
  if (backend !== 'azure_keyvault') return undefined;
  const trimmed = keyReference.trim();
  if (trimmed === '') {
    return 'Required for azure_keyvault: a versioned Key Vault key identifier.';
  }
  if (!looksLikeVersionedKeyVaultReference(trimmed)) {
    return 'Must be a versioned Key Vault key identifier: https://<vault>/keys/<name>/<version>.';
  }
  return undefined;
}

// The enum is wider than what can be created: it also admits the values a row
// may already carry from before the CP checked, and only the ECDSA curves can be
// assembled into a signer. Offering the rest would be offering a 422.
const CA_ALGORITHM_OPTIONS: readonly { value: CaAlgorithm; label: string }[] = [
  { value: 'ecdsa-p256', label: 'ecdsa-p256' },
  { value: 'ecdsa-p384', label: 'ecdsa-p384' },
  { value: 'ecdsa-p521', label: 'ecdsa-p521' },
];

const ALGORITHM_HINT =
  'Only the ECDSA curves can be assembled into a signer, so only they are offered. An existing CA may carry another value from before that check existed; it is still shown and still verifies the certificates it issued.';

const ROTATION_TONE: Record<CaRotationState, BadgeTone> = {
  incoming: 'info',
  active: 'pass',
  outgoing: 'warn',
  expired: 'fail',
};

// Backend, key reference and algorithm describe the CA's key, and an active
// CA's key cannot be changed by an edit — the write is rejected (409). Rotate
// is the only path that changes a key, so that's what's offered instead.
const EDIT_BLOCKED_ON_ACTIVE =
  'This CA is active. Its backend, key reference and algorithm describe its key, and changing them is a rotation, not an edit — use Rotate.';

type Dialog =
  | { kind: 'create' }
  | { kind: 'detail'; row: CaResource }
  | { kind: 'edit'; row: CaResource }
  | { kind: 'delete'; row: CaResource }
  | { kind: 'rotate'; row: CaResource };

function CaForm({
  existing,
  onDone,
}: {
  existing?: CaResource;
  onDone: () => void;
}) {
  const create = useCreateCa();
  const update = useUpdateCa();
  const [name, setName] = useState(existing?.name ?? '');
  const [caKind, setCaKind] = useState<CaKind>(existing?.caKind ?? 'user');
  const [backend, setBackend] = useState<CaBackend>(
    existing?.backend ?? 'local',
  );
  const [keyReference, setKeyReference] = useState(
    existing?.keyReference ?? '',
  );
  const [algorithm, setAlgorithm] = useState<CaAlgorithm>(
    existing?.algorithm ?? 'ecdsa-p256',
  );

  const pending = create.isPending || update.isPending;
  const keyReferenceError = azureKeyReferenceError(backend, keyReference);

  const submit = () => {
    if (existing) {
      update.mutate(
        {
          id: existing.id,
          body: { backend, keyReference, algorithm, version: existing.version },
        },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        { name, caKind, backend, keyReference, algorithm },
        { onSuccess: onDone },
      );
    }
  };

  return (
    <div className="form">
      {existing === undefined ? (
        <>
          <TextField label="Name" value={name} onChange={setName} required />
          <SelectField
            label="CA kind"
            value={caKind}
            onChange={setCaKind}
            options={CA_KIND_OPTIONS}
            required
          />
        </>
      ) : (
        <p className="muted">
          The name and CA kind are immutable; rotate to roll the key.
        </p>
      )}
      <SelectField
        label="Backend"
        value={backend}
        onChange={setBackend}
        options={CA_BACKEND_OPTIONS}
        required
        hint={BACKEND_HINT}
      />
      <TextField
        label="Key reference"
        value={keyReference}
        onChange={setKeyReference}
        required
        error={keyReferenceError}
        hint="A backend key handle/reference only — never private key material."
      />
      <SelectField
        label="Algorithm"
        value={algorithm}
        onChange={setAlgorithm}
        options={CA_ALGORITHM_OPTIONS}
        required
        hint={ALGORITHM_HINT}
      />
      <MutationError error={existing ? update.error : create.error} />
      <FormActions>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={pending || keyReferenceError !== undefined}
        >
          {pending ? 'Saving…' : existing ? 'Save changes' : 'Create CA'}
        </Button>
      </FormActions>
    </div>
  );
}

function CaDetail({ row }: { row: CaResource }) {
  return (
    <DetailList>
      <Detail label="Name">{row.name}</Detail>
      <Detail label="Kind">
        <Badge tone="neutral">{row.caKind}</Badge>
      </Detail>
      <Detail label="Backend">{row.backend}</Detail>
      <Detail label="Key reference">{row.keyReference}</Detail>
      <Detail label="Algorithm">{row.algorithm}</Detail>
      <Detail label="Rotation state">
        <Badge tone={ROTATION_TONE[row.rotationState]}>
          {row.rotationState}
        </Badge>
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

function RotateCaBody({
  row,
  onDone,
}: {
  row: CaResource;
  onDone: () => void;
}) {
  const rotate = useRotateCa();
  // '' means "inherit the active CA" — omitted from the request.
  const [algorithm, setAlgorithm] = useState<CaAlgorithm | ''>('');
  const [backend, setBackend] = useState<CaBackend | ''>('');
  const [keyReference, setKeyReference] = useState('');

  // What this rotation will actually run in, whether kept or overridden — this
  // is what decides whether azure_keyvault's key-reference rule applies, not
  // the raw dropdown value.
  const resolvedBackend = backend === '' ? row.backend : backend;
  const keyReferenceError = azureKeyReferenceError(
    resolvedBackend,
    keyReference,
  );
  const keyReferenceHint =
    resolvedBackend === 'azure_keyvault'
      ? 'Required for azure_keyvault: the versioned key the operator provisioned in the vault, e.g. https://<vault>.vault.azure.net/keys/<name>/<version>.'
      : 'Optional backend-provisioned handle; never private material.';

  const confirm = () => {
    rotate.mutate(
      {
        id: row.id,
        body: {
          algorithm: algorithm === '' ? undefined : algorithm,
          backend: backend === '' ? undefined : backend,
          keyReference: keyReference.trim() === '' ? undefined : keyReference,
        },
      },
      { onSuccess: onDone },
    );
  };

  return (
    <Dialog
      title={`Rotate CA "${row.name}"?`}
      onClose={onDone}
      footer={
        <>
          <Button variant="ghost" onClick={onDone} disabled={rotate.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={confirm}
            disabled={rotate.isPending || keyReferenceError !== undefined}
          >
            {rotate.isPending ? 'Working…' : 'Rotate'}
          </Button>
        </>
      }
    >
      <p>
        Provisions a new key and promotes it to active; the current key becomes
        outgoing and still verifies existing certificates until it expires.
      </p>
      <SelectField
        label="Backend"
        value={backend}
        onChange={setBackend}
        options={[
          { value: '', label: `Keep current backend (${row.backend})` },
          ...CA_BACKEND_OPTIONS,
        ]}
        hint={
          resolvedBackend === 'azure_keyvault' && backend !== ''
            ? `${BACKEND_HINT} Overriding this is how a CA is adopted onto azure_keyvault — the previous key stays trusted as outgoing during the overlap window.`
            : BACKEND_HINT
        }
      />
      <SelectField
        label="Algorithm override"
        value={algorithm}
        onChange={setAlgorithm}
        options={[
          { value: '', label: 'Keep current algorithm' },
          ...CA_ALGORITHM_OPTIONS,
        ]}
        hint={ALGORITHM_HINT}
      />
      <TextField
        label="Incoming key reference"
        value={keyReference}
        onChange={setKeyReference}
        required={resolvedBackend === 'azure_keyvault'}
        error={keyReferenceError}
        hint={keyReferenceHint}
      />
      {rotate.error !== null && <ProblemAlert error={rotate.error} />}
    </Dialog>
  );
}

export function CasScreen() {
  const canManage = useCan('ca:manage');
  const canRotate = useCan('ca:rotate');
  const canEnroll = useCan('node:enroll');
  const cas = useCas();
  const del = useDeleteCa();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => {
    setDialog(null);
    del.reset();
  };

  const columns: Column<CaResource>[] = [
    { header: 'Name', cell: (r) => r.name },
    { header: 'Kind', cell: (r) => r.caKind },
    { header: 'Backend', cell: (r) => r.backend },
    { header: 'Algorithm', cell: (r) => r.algorithm },
    {
      header: 'Rotation',
      cell: (r) => (
        <Badge tone={ROTATION_TONE[r.rotationState]}>{r.rotationState}</Badge>
      ),
    },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
    {
      header: 'Actions',
      align: 'right',
      cell: (r) =>
        canRotate ? (
          <Button
            size="sm"
            variant="info"
            onClick={(e) => {
              e.stopPropagation();
              setDialog({ kind: 'rotate', row: r });
            }}
          >
            Rotate
          </Button>
        ) : null,
    },
  ];

  return (
    <section>
      <PageHeader
        title="Certificate authorities"
        description="Per-CA backend and key reference. Private key material is never exposed."
        actions={
          canManage ? (
            <Button
              variant="primary"
              onClick={() => {
                setDialog({ kind: 'create' });
              }}
            >
              New CA…
            </Button>
          ) : undefined
        }
      />
      <CrudList
        list={cas}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Certificate authorities"
        emptyTitle="No certificate authorities yet"
        onRowClick={(row) => {
          setDialog({ kind: 'detail', row });
        }}
      />

      {canEnroll && <CaPublicKeyPanel />}

      {dialog?.kind === 'create' && (
        <Dialog title="New certificate authority" onClose={close}>
          <CaForm onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'edit' && (
        <Dialog title={`Edit CA "${dialog.row.name}"`} onClose={close}>
          <CaForm existing={dialog.row} onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'detail' && (
        <Dialog title={dialog.row.name} onClose={close}>
          <CaDetail row={dialog.row} />
          <FormActions>
            {canManage && (
              <Button
                disabled={dialog.row.rotationState === 'active'}
                title={
                  dialog.row.rotationState === 'active'
                    ? EDIT_BLOCKED_ON_ACTIVE
                    : undefined
                }
                onClick={() => {
                  setDialog({ kind: 'edit', row: dialog.row });
                }}
              >
                Edit
              </Button>
            )}
            {canRotate && (
              <Button
                onClick={() => {
                  setDialog({ kind: 'rotate', row: dialog.row });
                }}
              >
                Rotate
              </Button>
            )}
            {canManage && (
              <Button
                variant="danger"
                onClick={() => {
                  setDialog({ kind: 'delete', row: dialog.row });
                }}
              >
                Delete
              </Button>
            )}
          </FormActions>
        </Dialog>
      )}
      {dialog?.kind === 'rotate' && (
        <RotateCaBody row={dialog.row} onDone={close} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete CA "${dialog.row.name}"?`}
          confirmLabel="Delete"
          pending={del.isPending}
          error={del.error}
          onConfirm={() => {
            del.mutate(dialog.row.id, { onSuccess: close });
          }}
          onClose={close}
        >
          <p>
            Deleting the sole active CA of a kind is rejected — a kind must
            always retain a signer.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
