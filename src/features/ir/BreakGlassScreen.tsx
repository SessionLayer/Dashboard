import { useRef, useState, type KeyboardEvent } from 'react';

import type {
  BreakglassActivationResource,
  BreakglassCredentialResource,
  BreakglassOfflineCodeResource,
} from '../../api/types';
import { useCan } from '../../auth/AuthContext';
import {
  AsyncList,
  Badge,
  Button,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  NumberField,
  PageHeader,
  ProblemAlert,
  SecretReveal,
  SelectField,
  TagField,
  TextField,
  TextareaField,
  Time,
} from '../../ui';
import {
  useBreakglassActivations,
  useBreakglassCredentials,
  useBreakglassOfflineCodes,
  useIssueBreakglassOfflineCodes,
  useRegisterBreakglassCredential,
  useReviewBreakglassActivation,
  useRevokeBreakglassCredential,
} from './hooks';
import { reviewTone } from './status';
import './ir.css';

type TabId = 'activations' | 'credentials' | 'offline-codes';
const TABS: { id: TabId; label: string }[] = [
  { id: 'activations', label: 'Activations' },
  { id: 'credentials', label: 'FIDO2 credentials' },
  { id: 'offline-codes', label: 'Offline code batches' },
];

const PANEL_ID = 'bg-tabpanel';
const tabButtonId = (id: TabId) => `bg-tab-${id}`;

export function BreakGlassScreen() {
  const [tab, setTab] = useState<TabId>('activations');
  const canManage = useCan('breakglass:manage');
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

  // WAI-ARIA tabs keyboard model: Left/Right cycle, Home/End jump; the newly
  // selected tab both activates and takes focus (roving tabindex).
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next: number;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft')
      next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    const target = TABS[next];
    if (target === undefined) return;
    e.preventDefault();
    setTab(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  return (
    <section className="stack">
      <PageHeader
        title="Break-glass"
        description="Emergency access: activations under mandatory review, registered credentials, and offline codes (Design §7, FR-ACC-6)."
      />

      <div
        className="ir-tabs"
        role="tablist"
        aria-label="Break-glass sections"
        onKeyDown={onTabKeyDown}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el !== null) tabRefs.current.set(t.id, el);
              }}
              id={tabButtonId(t.id)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={PANEL_ID}
              tabIndex={active ? 0 : -1}
              className="ir-tab"
              onClick={() => {
                setTab(t.id);
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={tabButtonId(tab)}
        tabIndex={0}
      >
        {tab === 'activations' && <ActivationsTab canManage={canManage} />}
        {tab === 'credentials' && <CredentialsTab canManage={canManage} />}
        {tab === 'offline-codes' && <OfflineCodesTab canManage={canManage} />}
      </div>
    </section>
  );
}

// -------------------------------------------------------------- Activations

const REVIEW_FILTER_OPTIONS = [
  { value: '' as const, label: 'All' },
  { value: 'pending' as const, label: 'Pending review' },
  { value: 'reviewed' as const, label: 'Reviewed' },
];

function ActivationsTab({ canManage }: { canManage: boolean }) {
  const [filter, setFilter] = useState<'' | 'pending' | 'reviewed'>('');
  const [target, setTarget] = useState<BreakglassActivationResource | null>(
    null,
  );
  const activations = useBreakglassActivations(filter);

  const columns: Column<BreakglassActivationResource>[] = [
    { header: 'Identity', cell: (r) => r.identity ?? '—' },
    { header: 'Principal', cell: (r) => r.principal },
    { header: 'Reason', cell: (r) => r.reason },
    { header: 'Alert ref', cell: (r) => r.alertRef ?? '—' },
    { header: 'Policy', cell: (r) => r.breakglassPolicyName ?? '—' },
    {
      header: 'Review',
      cell: (r) => (
        <Badge tone={reviewTone(r.reviewStatus)}>{r.reviewStatus}</Badge>
      ),
    },
    { header: 'Activated', cell: (r) => <Time value={r.activatedAt} /> },
    {
      header: 'Actions',
      cell: (r) =>
        canManage && r.reviewStatus === 'pending' ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setTarget(r);
            }}
          >
            Review
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="stack">
      <div className="cluster">
        <SelectField
          label="Review status"
          value={filter}
          onChange={setFilter}
          options={REVIEW_FILTER_OPTIONS}
        />
      </div>
      <AsyncList
        isPending={activations.isPending}
        isError={activations.isError}
        error={activations.error}
        isEmpty={(activations.data?.length ?? 0) === 0}
        emptyTitle="No break-glass activations match this filter."
      >
        <DataTable
          caption="Break-glass activations"
          columns={columns}
          rows={activations.data ?? []}
          rowKey={(r) => r.id}
        />
      </AsyncList>
      {target !== null && (
        <ReviewActivationDialog
          activation={target}
          onClose={() => {
            setTarget(null);
          }}
        />
      )}
    </div>
  );
}

function ReviewActivationDialog({
  activation,
  onClose,
}: {
  activation: BreakglassActivationResource;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const review = useReviewBreakglassActivation();
  return (
    <ConfirmDialog
      title="Review activation"
      confirmLabel="Record review"
      variant="primary"
      pending={review.isPending}
      error={review.error}
      onConfirm={() => {
        review.mutate(
          { id: activation.id, reason: note },
          { onSuccess: onClose },
        );
      }}
      onClose={onClose}
    >
      <p className="muted">
        Record the mandatory post-hoc review of this break-glass use.
      </p>
      <TextareaField
        label="Note (optional)"
        value={note}
        onChange={setNote}
        rows={3}
      />
    </ConfirmDialog>
  );
}

// -------------------------------------------------------------- Credentials

function CredentialsTab({ canManage }: { canManage: boolean }) {
  const [registering, setRegistering] = useState(false);
  const [revoking, setRevoking] = useState<BreakglassCredentialResource | null>(
    null,
  );
  const credentials = useBreakglassCredentials();

  const columns: Column<BreakglassCredentialResource>[] = [
    {
      header: 'Fingerprint',
      cell: (r) => <span className="mono">{r.keyFingerprint}</span>,
    },
    { header: 'Identity', cell: (r) => r.identity },
    { header: 'Principals', cell: (r) => r.allowedPrincipals.join(', ') },
    { header: 'Nodes', cell: (r) => r.nodeIds?.join(', ') ?? 'fleet' },
    {
      header: 'Expires',
      cell: (r) =>
        r.expiresAt !== undefined ? (
          <Time value={r.expiresAt} />
        ) : (
          <span className="muted">Durable</span>
        ),
    },
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
              setRevoking(r);
            }}
          >
            Revoke
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="stack">
      {canManage && (
        <div className="cluster">
          <Button
            variant="primary"
            onClick={() => {
              setRegistering(true);
            }}
          >
            Register key…
          </Button>
        </div>
      )}
      <AsyncList
        isPending={credentials.isPending}
        isError={credentials.isError}
        error={credentials.error}
        isEmpty={(credentials.data?.length ?? 0) === 0}
        emptyTitle="No break-glass credentials registered."
      >
        <DataTable
          caption="Break-glass credentials"
          columns={columns}
          rows={credentials.data ?? []}
          rowKey={(r) => r.id}
        />
      </AsyncList>
      {registering && (
        <RegisterCredentialDialog
          onClose={() => {
            setRegistering(false);
          }}
        />
      )}
      {revoking !== null && (
        <RevokeCredentialDialog
          credential={revoking}
          onClose={() => {
            setRevoking(null);
          }}
        />
      )}
    </div>
  );
}

function RegisterCredentialDialog({ onClose }: { onClose: () => void }) {
  const [publicKey, setPublicKey] = useState('');
  const [identity, setIdentity] = useState('');
  const [allowedPrincipals, setAllowedPrincipals] = useState<string[]>([]);
  const [nodeIds, setNodeIds] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const register = useRegisterBreakglassCredential();

  const valid =
    publicKey.trim() !== '' &&
    identity.trim() !== '' &&
    allowedPrincipals.length > 0;

  const onSubmit = () => {
    register.mutate(
      {
        publicKey: publicKey.trim(),
        identity: identity.trim(),
        allowedPrincipals,
        ...(nodeIds.length > 0 ? { nodeIds } : {}),
        ...(expiresAt.trim() !== '' ? { expiresAt: expiresAt.trim() } : {}),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog
      title="Register break-glass key"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={register.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={!valid || register.isPending}
          >
            {register.isPending ? 'Registering…' : 'Register'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextareaField
          label="Public key (sk-ecdsa wire blob, base64)"
          value={publicKey}
          onChange={setPublicKey}
          required
          rows={3}
          monospace
          hint="PUBLIC material only — never a private key."
        />
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
        <TagField
          label="Node ids (optional; empty = fleet)"
          values={nodeIds}
          onChange={setNodeIds}
        />
        <TextField
          label="Expires at (optional, ISO 8601)"
          value={expiresAt}
          onChange={setExpiresAt}
          placeholder="2027-01-01T00:00:00Z"
        />
        {register.error !== null && <ProblemAlert error={register.error} />}
      </div>
    </Dialog>
  );
}

function RevokeCredentialDialog({
  credential,
  onClose,
}: {
  credential: BreakglassCredentialResource;
  onClose: () => void;
}) {
  const revoke = useRevokeBreakglassCredential();
  return (
    <ConfirmDialog
      title="Revoke credential"
      confirmLabel="Revoke"
      pending={revoke.isPending}
      error={revoke.error}
      onConfirm={() => {
        revoke.mutate(credential.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p>
        Revoke this break-glass credential? This is immediate and idempotent.
      </p>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------ Offline codes

function OfflineCodesTab({ canManage }: { canManage: boolean }) {
  const [issuing, setIssuing] = useState(false);
  const codes = useBreakglassOfflineCodes();

  const columns: Column<BreakglassOfflineCodeResource>[] = [
    { header: 'Identity', cell: (r) => r.identity },
    {
      header: 'Principals',
      cell: (r) => r.allowedPrincipals?.join(', ') ?? '—',
    },
    { header: 'Source CIDR', cell: (r) => r.sourceCidr ?? '—' },
    {
      header: 'Used',
      cell: (r) =>
        r.used ? (
          <Badge tone="neutral">Used</Badge>
        ) : (
          <Badge tone="pass">Unused</Badge>
        ),
    },
    { header: 'Expires', cell: (r) => <Time value={r.expiresAt} /> },
    { header: 'Created', cell: (r) => <Time value={r.createdAt} /> },
  ];

  return (
    <div className="stack">
      {canManage && (
        <div className="cluster">
          <Button
            variant="primary"
            onClick={() => {
              setIssuing(true);
            }}
          >
            Issue codes…
          </Button>
        </div>
      )}
      <AsyncList
        isPending={codes.isPending}
        isError={codes.isError}
        error={codes.error}
        isEmpty={(codes.data?.length ?? 0) === 0}
        emptyTitle="No offline codes issued."
      >
        <DataTable
          caption="Break-glass offline codes"
          columns={columns}
          rows={codes.data ?? []}
          rowKey={(r) => r.id}
        />
      </AsyncList>
      {issuing && (
        <IssueOfflineCodesDialog
          onClose={() => {
            setIssuing(false);
          }}
        />
      )}
    </div>
  );
}

function IssueOfflineCodesDialog({ onClose }: { onClose: () => void }) {
  const [identity, setIdentity] = useState('');
  const [allowedPrincipals, setAllowedPrincipals] = useState<string[]>([]);
  const [nodeIds, setNodeIds] = useState<string[]>([]);
  const [sourceCidr, setSourceCidr] = useState('');
  const [count, setCount] = useState<number | ''>(10);
  const issue = useIssueBreakglassOfflineCodes();
  const issued = issue.data;

  const valid = identity.trim() !== '' && allowedPrincipals.length > 0;

  const onSubmit = () => {
    issue.mutate({
      identity: identity.trim(),
      allowedPrincipals,
      ...(nodeIds.length > 0 ? { nodeIds } : {}),
      ...(sourceCidr.trim() !== '' ? { sourceCidr: sourceCidr.trim() } : {}),
      ...(typeof count === 'number' ? { count } : {}),
    });
  };

  if (issued !== undefined) {
    return (
      <Dialog
        title="Offline codes issued"
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="stack">
          <p className="muted">
            These {issued.codes.length} codes are shown once. Distribute them
            securely — only their hashes are stored.
          </p>
          <div className="ir-codes">
            {issued.codes.map((code, idx) => (
              <SecretReveal key={issued.ids[idx] ?? code} value={code} />
            ))}
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Issue offline codes"
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
            {issue.isPending ? 'Issuing…' : 'Issue codes'}
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
        <TagField
          label="Node ids (optional; empty = fleet)"
          values={nodeIds}
          onChange={setNodeIds}
        />
        <TextField
          label="Source CIDR (optional)"
          value={sourceCidr}
          onChange={setSourceCidr}
          placeholder="203.0.113.0/24"
        />
        <NumberField
          label="How many codes"
          value={count}
          onChange={setCount}
          min={1}
        />
        {issue.error !== null && <ProblemAlert error={issue.error} />}
      </div>
    </Dialog>
  );
}
