import { useState } from 'react';

import {
  Badge,
  Button,
  ConfirmDialog,
  Detail,
  DetailList,
  Dialog,
  FormActions,
  NumberField,
  PageHeader,
  SecretReveal,
  SelectField,
  TextField,
  TextareaField,
  Time,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type {
  ServiceAccountAuthMethod,
  ServiceAccountResource,
} from '../../api/types';
import { CrudList, MutationError, OriginBadge } from './common';
import {
  useCreateServiceAccount,
  useDeleteServiceAccount,
  useIssueServiceAccountCredential,
  useRevokeServiceAccountCredential,
  useServiceAccounts,
  useUpdateServiceAccount,
} from './hooks';

const AUTH_METHOD_OPTIONS: readonly {
  value: ServiceAccountAuthMethod;
  label: string;
}[] = [
  { value: 'private_key_jwt', label: 'private_key_jwt' },
  { value: 'mtls', label: 'mtls' },
  { value: 'client_secret', label: 'client_secret' },
];

type CredentialType = 'private_key_jwt' | 'mtls' | 'client_secret';

const CREDENTIAL_TYPE_OPTIONS: readonly {
  value: CredentialType;
  label: string;
}[] = AUTH_METHOD_OPTIONS;

type Dialog =
  | { kind: 'create' }
  | { kind: 'detail'; row: ServiceAccountResource }
  | { kind: 'edit'; row: ServiceAccountResource }
  | { kind: 'delete'; row: ServiceAccountResource };

function ServiceAccountForm({
  existing,
  onDone,
}: {
  existing?: ServiceAccountResource;
  onDone: () => void;
}) {
  const create = useCreateServiceAccount();
  const update = useUpdateServiceAccount();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [authMethod, setAuthMethod] = useState<ServiceAccountAuthMethod>(
    existing?.authMethod ?? 'private_key_jwt',
  );
  const [keyReference, setKeyReference] = useState(
    existing?.keyReference ?? '',
  );
  const [tokenTtl, setTokenTtl] = useState<number | ''>(
    existing?.tokenTtlSeconds ?? '',
  );

  const pending = create.isPending || update.isPending;

  const submit = () => {
    const trimmedDescription =
      description.trim() === '' ? undefined : description;
    const trimmedKeyRef = keyReference.trim() === '' ? undefined : keyReference;
    const tokenTtlSeconds = tokenTtl === '' ? undefined : tokenTtl;
    if (existing) {
      update.mutate(
        {
          id: existing.id,
          body: {
            description: trimmedDescription,
            authMethod,
            keyReference: trimmedKeyRef,
            tokenTtlSeconds,
            version: existing.version,
          },
        },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(
        {
          name,
          description: trimmedDescription,
          authMethod,
          keyReference: trimmedKeyRef,
          tokenTtlSeconds,
        },
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
      <SelectField
        label="Auth method"
        value={authMethod}
        onChange={setAuthMethod}
        options={AUTH_METHOD_OPTIONS}
        required
      />
      <TextField
        label="Key reference"
        value={keyReference}
        onChange={setKeyReference}
        hint="A public key / JWKS reference only — never a secret."
      />
      <NumberField
        label="Token TTL (seconds)"
        value={tokenTtl}
        onChange={setTokenTtl}
        min={1}
      />
      <MutationError error={existing ? update.error : create.error} />
      <FormActions>
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending
            ? 'Saving…'
            : existing
              ? 'Save changes'
              : 'Create service account'}
        </Button>
      </FormActions>
    </div>
  );
}

/** Issue + revoke runtime credentials. No list endpoint exists — revoke is by id. */
function CredentialsPanel({ account }: { account: ServiceAccountResource }) {
  const issue = useIssueServiceAccountCredential();
  const revoke = useRevokeServiceAccountCredential();
  const [credentialType, setCredentialType] =
    useState<CredentialType>('private_key_jwt');
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [jwksUri, setJwksUri] = useState('');
  const [fingerprint, setFingerprint] = useState('');
  const [ttl, setTtl] = useState<number | ''>('');
  const [revokeId, setRevokeId] = useState('');
  const [pendingRevoke, setPendingRevoke] = useState<string | undefined>(
    undefined,
  );

  const issued = issue.data;

  const submitIssue = () => {
    issue.mutate({
      id: account.id,
      body: {
        credentialType,
        publicKeyPem:
          credentialType === 'private_key_jwt' && publicKeyPem.trim() !== ''
            ? publicKeyPem
            : undefined,
        jwksUri:
          credentialType === 'private_key_jwt' && jwksUri.trim() !== ''
            ? jwksUri
            : undefined,
        certificateFingerprint:
          credentialType === 'mtls' && fingerprint.trim() !== ''
            ? fingerprint
            : undefined,
        ttlSeconds: ttl === '' ? undefined : ttl,
      },
    });
  };

  return (
    <div className="credentials-panel">
      <h3 className="dialog-subtitle">Credentials</h3>
      <SelectField
        label="Credential type"
        value={credentialType}
        onChange={setCredentialType}
        options={CREDENTIAL_TYPE_OPTIONS}
      />
      {credentialType === 'private_key_jwt' && (
        <>
          <TextareaField
            label="Public key (PEM)"
            value={publicKeyPem}
            onChange={setPublicKeyPem}
            rows={3}
            monospace
            hint="Public material only."
          />
          <TextField
            label="JWKS URI"
            type="url"
            value={jwksUri}
            onChange={setJwksUri}
            hint="Alternative to a PEM public key."
          />
        </>
      )}
      {credentialType === 'mtls' && (
        <TextField
          label="Certificate fingerprint"
          value={fingerprint}
          onChange={setFingerprint}
          hint="The client certificate SHA-256 fingerprint."
        />
      )}
      <NumberField
        label="Credential TTL (seconds)"
        value={ttl}
        onChange={setTtl}
        min={1}
      />
      <FormActions>
        <Button variant="info" onClick={submitIssue} disabled={issue.isPending}>
          {issue.isPending ? 'Issuing…' : 'Issue credential'}
        </Button>
      </FormActions>
      <MutationError error={issue.error} />

      {issued !== undefined && (
        <div className="issued-credential">
          <DetailList>
            <Detail label="Credential ID">{issued.id}</Detail>
            <Detail label="Type">{issued.credentialType}</Detail>
            <Detail label="Status">{issued.status}</Detail>
            {issued.fingerprint !== undefined && (
              <Detail label="Fingerprint">{issued.fingerprint}</Detail>
            )}
            <Detail label="Issued">
              <Time value={issued.issuedAt} />
            </Detail>
            <Detail label="Expires">
              <Time value={issued.notAfter} />
            </Detail>
          </DetailList>
          {issued.clientSecret !== undefined && (
            <SecretReveal value={issued.clientSecret} />
          )}
          <FormActions>
            <Button
              variant="danger"
              disabled={revoke.isPending}
              onClick={() => {
                setPendingRevoke(issued.id);
              }}
            >
              {revoke.isPending ? 'Revoking…' : 'Revoke this credential'}
            </Button>
          </FormActions>
        </div>
      )}

      <div className="revoke-by-id">
        <TextField
          label="Revoke credential by ID"
          value={revokeId}
          onChange={setRevokeId}
          hint="Paste a credential UUID to revoke it immediately."
        />
        <FormActions>
          <Button
            variant="danger"
            disabled={revoke.isPending || revokeId.trim() === ''}
            onClick={() => {
              setPendingRevoke(revokeId.trim());
            }}
          >
            Revoke
          </Button>
        </FormActions>
      </div>
      {revoke.isSuccess && (
        <p className="muted" role="status">
          Credential revoked.
        </p>
      )}
      <MutationError error={revoke.error} />

      {pendingRevoke !== undefined && (
        <ConfirmDialog
          title="Revoke this credential?"
          confirmLabel="Revoke"
          pending={revoke.isPending}
          error={revoke.error}
          onConfirm={() => {
            revoke.mutate(
              { id: account.id, credentialId: pendingRevoke },
              {
                onSuccess: () => {
                  setPendingRevoke(undefined);
                },
              },
            );
          }}
          onClose={() => {
            setPendingRevoke(undefined);
          }}
        >
          <p>
            New sessions using this credential are denied immediately. This
            cannot be undone.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function ServiceAccountDetail({
  row,
  canManage,
  onEdit,
  onDelete,
}: {
  row: ServiceAccountResource;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <DetailList>
        <Detail label="Name">{row.name}</Detail>
        <Detail label="Description">
          {row.description !== undefined && row.description !== ''
            ? row.description
            : '—'}
        </Detail>
        <Detail label="Auth method">
          <Badge tone="info">{row.authMethod}</Badge>
        </Detail>
        <Detail label="Key reference">
          {row.keyReference !== undefined && row.keyReference !== ''
            ? row.keyReference
            : '—'}
        </Detail>
        <Detail label="Token TTL">
          {row.tokenTtlSeconds !== undefined
            ? `${String(row.tokenTtlSeconds)}s`
            : '—'}
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
      {canManage && (
        <>
          <FormActions>
            <Button onClick={onEdit}>Edit</Button>
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </FormActions>
          <CredentialsPanel account={row} />
        </>
      )}
    </>
  );
}

export function ServiceAccountsScreen() {
  const canManage = useCan('user:manage');
  const accounts = useServiceAccounts();
  const del = useDeleteServiceAccount();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => {
    setDialog(null);
    del.reset();
  };

  const columns: Column<ServiceAccountResource>[] = [
    { header: 'Name', cell: (r) => r.name },
    {
      header: 'Auth method',
      cell: (r) => <Badge tone="info">{r.authMethod}</Badge>,
    },
    {
      header: 'Description',
      cell: (r) =>
        r.description !== undefined && r.description !== ''
          ? r.description
          : '—',
    },
    {
      header: 'Token TTL (s)',
      cell: (r) => r.tokenTtlSeconds ?? '—',
      align: 'right',
    },
    { header: 'Origin', cell: (r) => <OriginBadge origin={r.origin} /> },
  ];

  return (
    <section>
      <PageHeader
        title="Service accounts"
        description="Machine-consumer definitions. Issued credentials are runtime and shown once."
        actions={
          canManage ? (
            <Button
              variant="primary"
              onClick={() => {
                setDialog({ kind: 'create' });
              }}
            >
              New service account…
            </Button>
          ) : undefined
        }
      />
      <CrudList
        list={accounts}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Service accounts"
        emptyTitle="No service accounts yet"
        onRowClick={(row) => {
          setDialog({ kind: 'detail', row });
        }}
      />

      {dialog?.kind === 'create' && (
        <Dialog title="New service account" onClose={close}>
          <ServiceAccountForm onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'edit' && (
        <Dialog title={`Edit "${dialog.row.name}"`} onClose={close}>
          <ServiceAccountForm existing={dialog.row} onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'detail' && (
        <Dialog title={dialog.row.name} onClose={close}>
          <ServiceAccountDetail
            row={dialog.row}
            canManage={canManage}
            onEdit={() => {
              setDialog({ kind: 'edit', row: dialog.row });
            }}
            onDelete={() => {
              setDialog({ kind: 'delete', row: dialog.row });
            }}
          />
        </Dialog>
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete service account "${dialog.row.name}"?`}
          confirmLabel="Delete"
          pending={del.isPending}
          error={del.error}
          onConfirm={() => {
            del.mutate(dialog.row.id, { onSuccess: close });
          }}
          onClose={close}
        >
          <p>
            The definition is removed; issued runtime credentials are revoked
            separately.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
