import { useState } from 'react';

import {
  AsyncList,
  Badge,
  Button,
  DataTable,
  LoadMore,
  PageHeader,
  TextField,
  Time,
  type Column,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { RecordingResource } from '../../api/types';
import { statusTone, wormTone } from './badges';
import { useCustomerKey } from './customerKey';
import { ExportDialog } from './ExportDialog';
import { formatBytes, shortId } from './format';
import { KeyInput } from './KeyInput';
import { useRecordings, type RecordingFilters } from './recordingHooks';
import { RecordingDetails } from './RecordingDetails';
import { ReplayDialog } from './ReplayDialog';

const EMPTY_FILTERS: RecordingFilters = {};

export function RecordingsScreen() {
  const canReplay = useCan('recording:replay');
  const canExport = useCan('recording:export');

  const keyState = useCustomerKey();

  const [draft, setDraft] = useState<RecordingFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<RecordingFilters>(EMPTY_FILTERS);
  const list = useRecordings(filters);

  const [replayFor, setReplayFor] = useState<RecordingResource | undefined>();
  const [exportFor, setExportFor] = useState<RecordingResource | undefined>();
  const [detailFor, setDetailFor] = useState<RecordingResource | undefined>();

  const columns: Column<RecordingResource>[] = [
    { header: 'Identity', cell: (r) => r.identity ?? '—' },
    { header: 'Node', cell: (r) => <code>{shortId(r.nodeId)}</code> },
    { header: 'Format', cell: (r) => r.format ?? '—' },
    {
      header: 'Status',
      cell: (r) => <Badge tone={statusTone(r.status)}>{r.status ?? '—'}</Badge>,
    },
    {
      header: 'WORM',
      cell: (r) => (
        <Badge tone={wormTone(r.wormMode)}>{r.wormMode ?? '—'}</Badge>
      ),
    },
    { header: 'Size', align: 'right', cell: (r) => formatBytes(r.sizeBytes) },
    {
      header: 'Legal hold',
      cell: (r) =>
        r.legalHold === true ? (
          <Badge tone="warn">On hold</Badge>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { header: 'Retention', cell: (r) => <Time value={r.retentionUntil} /> },
    { header: 'Created', cell: (r) => <Time value={r.createdAt} /> },
    { header: 'Started', cell: (r) => <Time value={r.startedAt} /> },
    {
      header: 'Actions',
      cell: (r) => {
        const pruned = r.prunedAt !== undefined;
        return (
          <div className="row-actions">
            {canReplay && (
              <Button
                size="sm"
                variant="primary"
                disabled={pruned}
                title={pruned ? 'Object pruned — nothing to replay' : undefined}
                onClick={() => {
                  setReplayFor(r);
                }}
              >
                Replay
              </Button>
            )}
            {canExport && (
              <Button
                size="sm"
                disabled={pruned}
                title={pruned ? 'Object pruned — nothing to export' : undefined}
                onClick={() => {
                  setExportFor(r);
                }}
              >
                Export
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDetailFor(r);
              }}
            >
              Details
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="screen">
      <PageHeader
        title="Recordings"
        description="Session recordings are stored customer-key encrypted; the platform cannot decrypt them. Replay and export decrypt in your browser."
      />

      <KeyInput keyState={keyState} />

      <form
        className="filter-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
        }}
      >
        <TextField
          label="Identity"
          value={draft.identity ?? ''}
          onChange={(v) => {
            setDraft((d) => ({ ...d, identity: v }));
          }}
        />
        <TextField
          label="Session ID"
          value={draft.sessionId ?? ''}
          onChange={(v) => {
            setDraft((d) => ({ ...d, sessionId: v }));
          }}
        />
        <TextField
          label="Node ID"
          value={draft.nodeId ?? ''}
          onChange={(v) => {
            setDraft((d) => ({ ...d, nodeId: v }));
          }}
        />
        <div className="filter-actions">
          <Button type="submit" variant="primary">
            Search
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              setFilters(EMPTY_FILTERS);
            }}
          >
            Clear
          </Button>
        </div>
      </form>

      <AsyncList
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.items.length === 0}
        emptyTitle="No recordings match."
      >
        <DataTable
          caption="Session recordings"
          columns={columns}
          rows={list.items}
          rowKey={(r) => r.id}
        />
        <LoadMore
          hasNextPage={list.hasNextPage}
          isFetchingNextPage={list.isFetchingNextPage}
          onLoadMore={list.fetchNextPage}
        />
      </AsyncList>

      {replayFor !== undefined && (
        <ReplayDialog
          recording={replayFor}
          keyState={keyState}
          onClose={() => {
            setReplayFor(undefined);
          }}
        />
      )}
      {exportFor !== undefined && (
        <ExportDialog
          recording={exportFor}
          keyState={keyState}
          onClose={() => {
            setExportFor(undefined);
          }}
        />
      )}
      {detailFor !== undefined && (
        <RecordingDetails
          recording={detailFor}
          onClose={() => {
            setDetailFor(undefined);
          }}
        />
      )}
    </div>
  );
}
