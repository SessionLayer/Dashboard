import { useState } from 'react';

import {
  AsyncList,
  Badge,
  Button,
  CheckboxField,
  DataTable,
  Dialog,
  LoadMore,
  PageHeader,
  ProblemAlert,
  TextField,
  TextareaField,
  Time,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { SessionLeaseResource } from '../../api/types';
import {
  useReleaseSessionLease,
  useSessionLeases,
  type SessionLeaseFilters,
} from './api';

/**
 * A stuck lease is NOT "expired but still counted" — the cap counts leases that
 * are unreleased AND unexpired, so an expired lease has already stopped
 * occupying its slot and `releasedAt` only tidies the row afterwards. It is a
 * lease that STILL counts with no live session behind it, and settling that
 * needs the active sessions for the same identity, which this collection cannot
 * see. What the lease row alone does prove is a missing `sessionId`: the
 * contract calls a pruned session row a sign of a stuck lease.
 */
function orphaned(lease: SessionLeaseResource): boolean {
  return lease.countsTowardCap && lease.sessionId === undefined;
}

function unbounded(lease: SessionLeaseResource): boolean {
  return lease.countsTowardCap && lease.expiresAt === undefined;
}

export function SessionLeaseList() {
  const [identity, setIdentity] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [releasing, setReleasing] = useState<SessionLeaseResource | null>(null);

  const filters: SessionLeaseFilters = {
    ...(identity.trim() !== '' ? { identity: identity.trim() } : {}),
    ...(activeOnly ? { activeOnly: true } : {}),
  };
  const list = useSessionLeases(filters);
  const canRelease = useCan('lock:write');

  const columns: Column<SessionLeaseResource>[] = [
    { header: 'Identity', cell: (l) => l.identity },
    {
      header: 'Counts toward cap',
      cell: (l) =>
        orphaned(l) ? (
          <Badge tone="fail">yes — no session row</Badge>
        ) : l.countsTowardCap ? (
          <Badge tone="info">yes</Badge>
        ) : (
          <Badge tone="neutral">no</Badge>
        ),
    },
    {
      header: 'Session',
      cell: (l) =>
        l.sessionId ?? <span className="muted">— (session row gone)</span>,
    },
    {
      header: 'Gateway',
      cell: (l) => l.gatewayName ?? <span className="muted">—</span>,
    },
    { header: 'Acquired', cell: (l) => <Time value={l.acquiredAt} /> },
    {
      header: 'Expires',
      cell: (l) =>
        unbounded(l) ? (
          <Badge tone="warn">no TTL — counts until released</Badge>
        ) : (
          <Time value={l.expiresAt} />
        ),
    },
    { header: 'Released', cell: (l) => <Time value={l.releasedAt} /> },
    {
      header: 'Actions',
      align: 'right',
      cell: (l) =>
        canRelease && l.countsTowardCap ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setReleasing(l);
            }}
          >
            Release
          </Button>
        ) : null,
    },
  ];

  return (
    <section>
      <PageHeader
        title="Session leases"
        description={
          <>
            The concurrency leases the per-identity session cap is counted from.
            An identity blocked by a lease that outlived its session is refused
            with the same message as a real policy denial, so this is where the
            two are told apart. A lease counts while it is unreleased and
            unexpired — an expired one has already stopped counting, so the
            over-count is not &ldquo;expired but still counted&rdquo;. To find
            it, filter here by identity with the cap filter on, and compare the
            count against the same identity&apos;s active sessions.
          </>
        }
      />

      <div className="filter-bar">
        <TextField
          label="Identity"
          value={identity}
          onChange={setIdentity}
          placeholder="Filter by subject identity"
        />
        <CheckboxField
          label="Counting toward the cap only"
          checked={activeOnly}
          onChange={setActiveOnly}
        />
      </div>

      <AsyncList
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.items.length === 0}
        emptyTitle="No leases match."
      >
        <DataTable
          caption="Concurrency leases"
          columns={columns}
          rows={list.items}
          rowKey={(l) => l.id}
        />
        <LoadMore
          hasNextPage={list.hasNextPage}
          isFetchingNextPage={list.isFetchingNextPage}
          onLoadMore={list.fetchNextPage}
        />
      </AsyncList>

      {releasing !== null && (
        <ReleaseSessionLeaseDialog
          lease={releasing}
          onClose={() => {
            setReleasing(null);
          }}
        />
      )}
    </section>
  );
}

function ReleaseSessionLeaseDialog({
  lease,
  onClose,
}: {
  lease: SessionLeaseResource;
  onClose: () => void;
}) {
  const release = useReleaseSessionLease();
  const [reason, setReason] = useState('');

  return (
    <Dialog
      title={`Release this lease for ${lease.identity}?`}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={release.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={release.isPending || reason.trim() === ''}
            onClick={() => {
              release.mutate(
                { sessionLeaseId: lease.id, body: { reason: reason.trim() } },
                { onSuccess: onClose },
              );
            }}
          >
            {release.isPending ? 'Releasing…' : 'Release lease'}
          </Button>
        </>
      }
    >
      <p>
        Frees the one slot this lease occupies. If the session behind it is in
        fact still running, releasing hands this identity capacity above their
        cap for as long as it lasts — which is why there is no bulk release, and
        why the reason is recorded.
      </p>
      <TextareaField
        label="Reason"
        required
        rows={2}
        value={reason}
        onChange={setReason}
        hint="Audited. An unexplained release is indistinguishable afterwards from quietly raising someone's cap."
      />
      {release.error !== null && <ProblemAlert error={release.error} />}
    </Dialog>
  );
}
