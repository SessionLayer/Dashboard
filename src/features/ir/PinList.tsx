import { useState } from 'react';

import type { PinResource } from '../../api/types';
import { useCan } from '../../auth/AuthContext';
import {
  AsyncList,
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Detail,
  DetailList,
  Dialog,
  EmptyState,
  NumberField,
  PageHeader,
  ProblemAlert,
  SecretReveal,
  TagField,
  TextField,
  Time,
} from '../../ui';
import { useCreatePin, useIssueOtp, usePins, useRevokePin } from './hooks';
import './ir.css';

type Modal =
  { kind: 'create' } | { kind: 'revoke'; row: PinResource } | { kind: 'otp' };

export function PinList() {
  const [identity, setIdentity] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const trimmed = identity.trim();
  const pins = usePins(identity);
  const canManage = useCan('user:manage');
  const close = () => {
    setModal(null);
  };

  const columns: Column<PinResource>[] = [
    {
      header: 'Fingerprint',
      cell: (r) => <span className="mono">{r.fingerprint}</span>,
    },
    { header: 'Identity', cell: (r) => r.identity },
    { header: 'Source CIDR', cell: (r) => r.sourceCidr ?? '—' },
    { header: 'Principals', cell: (r) => r.principals.join(', ') },
    { header: 'Expires', cell: (r) => <Time value={r.expiresAt} /> },
    {
      header: 'Status',
      cell: (r) =>
        r.revokedAt !== undefined ? (
          <Badge tone="fail">Revoked</Badge>
        ) : (
          <Badge tone="pass">Active</Badge>
        ),
    },
    {
      header: 'Actions',
      cell: (r) =>
        canManage && r.revokedAt === undefined ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setModal({ kind: 'revoke', row: r });
            }}
          >
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <section className="stack">
      <PageHeader
        title="Pins & OTP"
        description="AuthN shortcuts: key-fingerprint pins bound to an identity (Design §5.5) and admin-issued single-use OTPs (Design §5.4)."
        actions={
          canManage ? (
            <div className="cluster">
              <Button
                variant="info"
                onClick={() => {
                  setModal({ kind: 'otp' });
                }}
              >
                Issue OTP…
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setModal({ kind: 'create' });
                }}
              >
                New pin…
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="cluster">
        <TextField
          label="Identity"
          value={identity}
          onChange={setIdentity}
          placeholder="Enter an identity to list its pins"
          hint="Pins are listed per identity."
        />
      </div>

      {trimmed === '' ? (
        <EmptyState title="Enter an identity to list its pins." />
      ) : (
        <AsyncList
          isPending={pins.isPending}
          isError={pins.isError}
          error={pins.error}
          isEmpty={(pins.data?.length ?? 0) === 0}
          emptyTitle={`No pins for "${trimmed}".`}
        >
          <DataTable
            caption="Pins for the selected identity"
            columns={columns}
            rows={pins.data ?? []}
            rowKey={(r) => r.id}
          />
        </AsyncList>
      )}

      {modal?.kind === 'create' && (
        <CreatePinDialog defaultIdentity={trimmed} onClose={close} />
      )}
      {modal?.kind === 'revoke' && (
        <RevokePinDialog pin={modal.row} onClose={close} />
      )}
      {modal?.kind === 'otp' && (
        <IssueOtpDialog defaultIdentity={trimmed} onClose={close} />
      )}
    </section>
  );
}

function IssueOtpDialog({
  defaultIdentity,
  onClose,
}: {
  defaultIdentity: string;
  onClose: () => void;
}) {
  const [identity, setIdentity] = useState(defaultIdentity);
  const [allowedPrincipals, setAllowedPrincipals] = useState<string[]>([]);
  const [sourceCidr, setSourceCidr] = useState('');
  const [ttl, setTtl] = useState<number | ''>('');
  const issue = useIssueOtp();
  const issued = issue.data;

  const valid = identity.trim() !== '' && allowedPrincipals.length > 0;

  const onSubmit = () => {
    issue.mutate({
      identity: identity.trim(),
      allowedPrincipals,
      ...(sourceCidr.trim() !== '' ? { sourceCidr: sourceCidr.trim() } : {}),
      ...(typeof ttl === 'number' ? { ttlSeconds: ttl } : {}),
    });
  };

  if (issued !== undefined) {
    return (
      <Dialog
        title="OTP issued"
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="stack">
          <SecretReveal
            value={issued.otp}
            caption="Deliver this OTP out-of-band now — it is shown once and only its hash is stored."
          />
          <DetailList>
            <Detail label="Expires">
              <Time value={issued.expiresAt} />
            </Detail>
          </DetailList>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Issue OTP"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={issue.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!valid || issue.isPending}
          >
            {issue.isPending ? 'Issuing…' : 'Issue OTP'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextField
          label="Identity"
          value={identity}
          onChange={setIdentity}
          required
        />
        <TagField
          label="Allowed principals"
          values={allowedPrincipals}
          onChange={setAllowedPrincipals}
        />
        <TextField
          label="Source CIDR (optional)"
          value={sourceCidr}
          onChange={setSourceCidr}
          placeholder="203.0.113.0/24"
          hint="Deny-only reducer — an OTP never grants beyond the authorization."
        />
        <NumberField
          label="TTL (seconds, optional)"
          value={ttl}
          onChange={setTtl}
          min={60}
          hint="60–300s; defaults to the operator setting when left empty."
        />
        {issue.error !== null && <ProblemAlert error={issue.error} />}
      </div>
    </Dialog>
  );
}

function CreatePinDialog({
  defaultIdentity,
  onClose,
}: {
  defaultIdentity: string;
  onClose: () => void;
}) {
  const [fingerprint, setFingerprint] = useState('');
  const [identity, setIdentity] = useState(defaultIdentity);
  const [sourceCidr, setSourceCidr] = useState('');
  const [principals, setPrincipals] = useState<string[]>([]);
  const [ttl, setTtl] = useState<number | ''>('');
  const create = useCreatePin();

  const valid =
    fingerprint.trim() !== '' &&
    identity.trim() !== '' &&
    principals.length > 0 &&
    typeof ttl === 'number';

  const onSubmit = () => {
    if (typeof ttl !== 'number') return;
    create.mutate(
      {
        fingerprint: fingerprint.trim(),
        identity: identity.trim(),
        principals,
        ttlSeconds: ttl,
        ...(sourceCidr.trim() !== '' ? { sourceCidr: sourceCidr.trim() } : {}),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog
      title="Create pin"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!valid || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create pin'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextField
          label="Public-key fingerprint"
          value={fingerprint}
          onChange={setFingerprint}
          required
          placeholder="SHA256:…"
        />
        <TextField
          label="Identity"
          value={identity}
          onChange={setIdentity}
          required
        />
        <TagField
          label="Principals"
          values={principals}
          onChange={setPrincipals}
        />
        <TextField
          label="Source CIDR (optional)"
          value={sourceCidr}
          onChange={setSourceCidr}
          placeholder="203.0.113.0/24"
        />
        <NumberField
          label="TTL (seconds)"
          value={ttl}
          onChange={setTtl}
          required
          min={1}
          hint="Capped at the authorization TTL."
        />
        {create.error !== null && <ProblemAlert error={create.error} />}
      </div>
    </Dialog>
  );
}

function RevokePinDialog({
  pin,
  onClose,
}: {
  pin: PinResource;
  onClose: () => void;
}) {
  const revoke = useRevokePin();
  return (
    <ConfirmDialog
      title="Revoke pin"
      confirmLabel="Revoke"
      pending={revoke.isPending}
      error={revoke.error}
      onConfirm={() => {
        revoke.mutate(pin.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p>Revoke this pin? This is immediate and idempotent.</p>
    </ConfirmDialog>
  );
}
