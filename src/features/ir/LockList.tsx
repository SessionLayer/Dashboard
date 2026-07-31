import { useState, type ReactNode } from 'react';

import type { LockResource, LockTarget } from '../../api/types';
import { useCan } from '../../auth/AuthContext';
import {
  AsyncList,
  Badge,
  Button,
  CheckboxField,
  type Column,
  ConfirmDialog,
  DataTable,
  Dialog,
  NumberField,
  PageHeader,
  ProblemAlert,
  TagField,
  TextareaField,
  Time,
} from '../../ui';
import { useCreateLock, useLocks, useReleaseLock } from './hooks';
import './ir.css';

type Modal = { kind: 'create' } | { kind: 'release'; row: LockResource };

const FACETS: { key: keyof Omit<LockTarget, 'all'>; label: string }[] = [
  { key: 'identities', label: 'identities' },
  { key: 'groups', label: 'groups' },
  { key: 'nodeIds', label: 'nodes' },
  { key: 'principals', label: 'principals' },
  { key: 'nodeLabels', label: 'labels' },
];

function summarizeTarget(target: LockTarget): ReactNode {
  if (target.all === true) return <Badge tone="fail">Fleet-wide (all)</Badge>;
  const parts = FACETS.flatMap(({ key, label }) => {
    const values = target[key];
    return values !== undefined && values.length > 0
      ? [`${label}: ${values.join(', ')}`]
      : [];
  });
  return parts.length > 0 ? parts.join(' · ') : '—';
}

// The contract has no standalone "kind" field on a lock — it's derived here
// from which target facet is populated (the same data `summarizeTarget` reads),
// not invented. A lock can only match one facet family (the create form is
// exclusive: fleet-wide OR a set of facets), so the first populated facet is
// unambiguous.
const KIND_LABEL: Record<keyof Omit<LockTarget, 'all'>, string> = {
  nodeIds: 'node',
  identities: 'identity',
  groups: 'group',
  principals: 'principal',
  nodeLabels: 'label',
};

function lockKind(target: LockTarget): string {
  if (target.all === true) return 'fleet-wide';
  const facet = FACETS.find(({ key }) => {
    const values = target[key];
    return values !== undefined && values.length > 0;
  });
  return facet !== undefined ? KIND_LABEL[facet.key] : '—';
}

export function LockList() {
  const [modal, setModal] = useState<Modal | null>(null);
  const locks = useLocks();
  const canWrite = useCan('lock:write');
  const close = () => {
    setModal(null);
  };

  const columns: Column<LockResource>[] = [
    { header: 'Target', cell: (r) => summarizeTarget(r.target) },
    {
      header: 'Kind',
      cell: (r) => <Badge tone="neutral">{lockKind(r.target)}</Badge>,
    },
    { header: 'Reason', cell: (r) => r.reason },
    {
      header: 'Expires',
      cell: (r) =>
        r.expiresAt !== undefined ? (
          <Time value={r.expiresAt} />
        ) : (
          <span className="muted">No expiry</span>
        ),
    },
    { header: 'Created', cell: (r) => <Time value={r.createdAt} /> },
    { header: 'By', cell: (r) => r.createdBy ?? '—' },
    {
      header: 'Actions',
      cell: (r) =>
        canWrite ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setModal({ kind: 'release', row: r });
            }}
          >
            Release
          </Button>
        ) : null,
    },
  ];

  return (
    <section className="stack">
      <PageHeader
        title="Locks"
        description="Incident-response denies — a top-tier, un-overridable block (Design §8.3/§8.4)."
        actions={
          canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setModal({ kind: 'create' });
              }}
            >
              New lock…
            </Button>
          ) : undefined
        }
      />

      <AsyncList
        isPending={locks.isPending}
        isError={locks.isError}
        error={locks.error}
        isEmpty={(locks.data?.length ?? 0) === 0}
        emptyTitle="No active locks."
      >
        <DataTable
          caption="Active locks"
          columns={columns}
          rows={locks.data ?? []}
          rowKey={(r) => r.id}
        />
      </AsyncList>

      {modal?.kind === 'create' && <CreateLockDialog onClose={close} />}
      {modal?.kind === 'release' && (
        <ReleaseLockDialog lock={modal.row} onClose={close} />
      )}
    </section>
  );
}

function CreateLockDialog({ onClose }: { onClose: () => void }) {
  const [identities, setIdentities] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [nodeIds, setNodeIds] = useState<string[]>([]);
  const [principals, setPrincipals] = useState<string[]>([]);
  const [nodeLabels, setNodeLabels] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [reason, setReason] = useState('');
  const [ttl, setTtl] = useState<number | ''>('');
  const create = useCreateLock();

  const hasFacet =
    identities.length > 0 ||
    groups.length > 0 ||
    nodeIds.length > 0 ||
    principals.length > 0 ||
    nodeLabels.length > 0;
  const valid = reason.trim() !== '' && (all || hasFacet);

  const onSubmit = () => {
    const target: LockTarget = all
      ? { all: true }
      : {
          ...(identities.length > 0 ? { identities } : {}),
          ...(groups.length > 0 ? { groups } : {}),
          ...(nodeIds.length > 0 ? { nodeIds } : {}),
          ...(principals.length > 0 ? { principals } : {}),
          ...(nodeLabels.length > 0 ? { nodeLabels } : {}),
        };
    create.mutate(
      {
        target,
        reason: reason.trim(),
        ...(typeof ttl === 'number' ? { ttlSeconds: ttl } : {}),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog
      title="Create lock"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onSubmit}
            disabled={!valid || create.isPending}
          >
            {create.isPending ? 'Locking…' : 'Create lock'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">
          Matches on any facet (OR). A fleet-wide lock requires the explicit
          toggle below — an empty target is rejected.
        </p>
        <CheckboxField
          label="Fleet-wide (deny everything)"
          checked={all}
          onChange={setAll}
          hint="Overrides the facets below."
        />
        {!all && (
          <>
            <TagField
              label="Identities"
              values={identities}
              onChange={setIdentities}
            />
            <TagField label="Groups" values={groups} onChange={setGroups} />
            <TagField label="Node ids" values={nodeIds} onChange={setNodeIds} />
            <TagField
              label="Principals"
              values={principals}
              onChange={setPrincipals}
            />
            <TagField
              label="Node labels (key=value)"
              values={nodeLabels}
              onChange={setNodeLabels}
            />
          </>
        )}
        <TextareaField
          label="Reason"
          value={reason}
          onChange={setReason}
          required
          rows={2}
          hint="Operator-only; never disclosed to the SSH user."
        />
        <NumberField
          label="TTL (seconds)"
          value={ttl}
          onChange={setTtl}
          min={1}
          hint="Empty = indefinite until released."
        />
        {create.error !== null && <ProblemAlert error={create.error} />}
      </div>
    </Dialog>
  );
}

function ReleaseLockDialog({
  lock,
  onClose,
}: {
  lock: LockResource;
  onClose: () => void;
}) {
  const release = useReleaseLock();
  return (
    <ConfirmDialog
      title="Release lock"
      confirmLabel="Release"
      pending={release.isPending}
      error={release.error}
      onConfirm={() => {
        release.mutate(lock.id, { onSuccess: onClose });
      }}
      onClose={onClose}
    >
      <p>
        Release this lock? Future denial stops immediately, but a torn-down
        session is never resurrected.
      </p>
    </ConfirmDialog>
  );
}
