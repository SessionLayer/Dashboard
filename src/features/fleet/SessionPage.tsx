import { useState } from 'react';

import {
  AsyncList,
  Button,
  CheckboxField,
  DataTable,
  LoadMore,
  PageHeader,
  SelectField,
  TextField,
  Time,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { AccessModel, SessionResource } from '../../api/types';
import { AccessModelBadge, CapabilityBadges } from './badges';
import { useSessions, type SessionFilters } from './api';
import { SessionDetailDialog, TerminateSessionDialog } from './SessionDialogs';

/** `startedAt`→`endedAt` (or `now` for a live session) as a compact clock —
 *  purely derived from the two real timestamps the API already returns. */
function formatDuration(
  startedAt: string,
  endedAt: string | undefined,
  now: number,
): string {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return '—';
  const end = endedAt !== undefined ? Date.parse(endedAt) : now;
  if (Number.isNaN(end)) return '—';
  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${String(h)}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${String(m)}m`;
  return `${String(s)}s`;
}

type AccessFilter = AccessModel | 'all';

const ACCESS_OPTIONS: readonly { value: AccessFilter; label: string }[] = [
  { value: 'all', label: 'All access models' },
  { value: 'standing', label: 'Standing' },
  { value: 'jit', label: 'JIT' },
  { value: 'breakglass', label: 'Break-glass' },
];

type Dialog =
  | { kind: 'detail'; sessionId: string }
  | { kind: 'terminate'; session: SessionResource }
  | null;

export function SessionPage() {
  const [identity, setIdentity] = useState('');
  const [access, setAccess] = useState<AccessFilter>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  // Snapshot once per mount (not read impurely during render) — a live
  // session's Duration is a point-in-time label, same convention as `Time`.
  const [now] = useState(() => Date.now());

  const filters: SessionFilters = {
    ...(identity.trim() !== '' ? { identity: identity.trim() } : {}),
    ...(access !== 'all' ? { accessModel: access } : {}),
    ...(activeOnly ? { activeOnly: true } : {}),
  };

  const {
    items,
    isPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useSessions(filters);
  const canTerminate = useCan('lock:write');

  const columns: Column<SessionResource>[] = [
    {
      header: 'Identity',
      cell: (s) => (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setDialog({ kind: 'detail', sessionId: s.id });
          }}
        >
          {s.identity}
        </button>
      ),
    },
    {
      header: 'Node',
      cell: (s) => s.nodeName ?? <span className="muted">—</span>,
    },
    { header: 'Principal', cell: (s) => s.principal },
    {
      header: 'Capability',
      cell: (s) => <CapabilityBadges caps={s.capabilities} />,
    },
    {
      header: 'Access',
      cell: (s) => <AccessModelBadge model={s.accessModel} />,
    },
    { header: 'Started', cell: (s) => <Time value={s.startedAt} /> },
    {
      header: 'Duration',
      cell: (s) => formatDuration(s.startedAt, s.endedAt, now),
    },
    { header: 'Ended', cell: (s) => <Time value={s.endedAt} /> },
    {
      header: 'Actions',
      align: 'right',
      cell: (s) =>
        canTerminate && s.endedAt === undefined ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setDialog({ kind: 'terminate', session: s });
            }}
          >
            Terminate
          </Button>
        ) : null,
    },
  ];

  const close = () => {
    setDialog(null);
  };

  return (
    <section>
      <PageHeader
        title="Sessions"
        description="SSH sessions with their decision snapshot (identity, node, principal, access model)."
      />

      <div className="filter-bar">
        <TextField
          label="Identity"
          value={identity}
          onChange={setIdentity}
          placeholder="Filter by subject identity"
        />
        <SelectField
          label="Access model"
          value={access}
          onChange={setAccess}
          options={ACCESS_OPTIONS}
        />
        <CheckboxField
          label="Active only"
          checked={activeOnly}
          onChange={setActiveOnly}
        />
      </div>

      <AsyncList
        isPending={isPending}
        isError={isError}
        error={error}
        isEmpty={items.length === 0}
        emptyTitle="No sessions match."
      >
        <DataTable
          caption="SSH sessions"
          columns={columns}
          rows={items}
          rowKey={(s) => s.id}
        />
        <LoadMore
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      </AsyncList>

      {dialog?.kind === 'detail' && (
        <SessionDetailDialog sessionId={dialog.sessionId} onClose={close} />
      )}
      {dialog?.kind === 'terminate' && (
        <TerminateSessionDialog session={dialog.session} onClose={close} />
      )}
    </section>
  );
}
