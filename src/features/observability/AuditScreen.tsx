import { useState } from 'react';

import {
  AsyncList,
  Badge,
  DataTable,
  LoadMore,
  PageHeader,
  Time,
  type Column,
} from '../../ui';
import type { AuditEventResource } from '../../api/types';
import { AuditFilters } from './AuditFilters';
import { useAuditEvents, type AuditFilters as Filters } from './auditHooks';
import { outcomeTone } from './badges';
import { CorrelatedStory } from './CorrelatedStory';
import { shortId, summarizeDetail } from './format';

const EMPTY: Filters = {};

export function AuditScreen() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const list = useAuditEvents(filters);
  const [selected, setSelected] = useState<AuditEventResource | undefined>();

  // Column set mirrors the operator-console audit-log design (Time / Type /
  // Detail / Actor / Correlation / Decision); a row click reconstructs the
  // full correlated story, including the fields (subject, session, node,
  // source IP) that don't fit in this dense row.
  const columns: Column<AuditEventResource>[] = [
    { header: 'Time', cell: (e) => <Time value={e.occurredAt} /> },
    { header: 'Type', cell: (e) => <code>{e.action}</code> },
    { header: 'Detail', cell: (e) => summarizeDetail(e.detail) },
    { header: 'Actor', cell: (e) => e.actor },
    {
      header: 'Correlation',
      cell: (e) => <code>{shortId(e.correlationId)}</code>,
    },
    {
      header: 'Decision',
      cell: (e) => <Badge tone={outcomeTone(e.outcome)}>{e.outcome}</Badge>,
    },
  ];

  return (
    <div className="screen">
      <PageHeader
        title="Audit events"
        description="One append-only, correlated stream of SSH-session and admin events, newest first. Click a row to reconstruct its full correlated path."
      />

      <AuditFilters
        draft={draft}
        onChange={setDraft}
        onSubmit={() => {
          setFilters(draft);
        }}
        onClear={() => {
          setDraft(EMPTY);
          setFilters(EMPTY);
        }}
      />

      <AsyncList
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.items.length === 0}
        emptyTitle="No audit events match."
      >
        <DataTable
          caption="Audit events"
          columns={columns}
          rows={list.items}
          rowKey={(e) => e.id}
          onRowClick={(e) => {
            setSelected(e);
          }}
        />
        <LoadMore
          hasNextPage={list.hasNextPage}
          isFetchingNextPage={list.isFetchingNextPage}
          onLoadMore={list.fetchNextPage}
        />
      </AsyncList>

      {selected !== undefined && (
        <CorrelatedStory
          event={selected}
          onClose={() => {
            setSelected(undefined);
          }}
        />
      )}
    </div>
  );
}
