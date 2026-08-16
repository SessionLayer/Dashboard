import type { ReactNode } from 'react';

import {
  AsyncList,
  Badge,
  DataTable,
  LoadMore,
  ProblemAlert,
  type Column,
} from '../../ui';
import type { CursorListResult } from '../../api/http';
import { ProblemError } from '../../api/problem';
import type { Origin } from '../../api/types';

export function CrudList<T>({
  list,
  columns,
  rowKey,
  caption,
  emptyTitle,
  onRowClick,
}: {
  list: CursorListResult<T>;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  emptyTitle: string;
  onRowClick?: (row: T) => void;
}): ReactNode {
  return (
    <AsyncList
      isPending={list.isPending}
      isError={list.isError}
      error={list.error}
      isEmpty={list.items.length === 0}
      emptyTitle={emptyTitle}
    >
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={rowKey}
        caption={caption}
        onRowClick={onRowClick}
      />
      <LoadMore
        hasNextPage={list.hasNextPage}
        isFetchingNextPage={list.isFetchingNextPage}
        onLoadMore={list.fetchNextPage}
      />
    </AsyncList>
  );
}

const ORIGIN_TONE = {
  default: 'neutral',
  api: 'info',
  ui: 'accent',
} as const;

export function OriginBadge({ origin }: { origin: Origin }): ReactNode {
  return <Badge tone={ORIGIN_TONE[origin]}>{origin}</Badge>;
}

export function MutationError({ error }: { error: unknown }): ReactNode {
  if (error === null || error === undefined) return null;
  const conflict = error instanceof ProblemError && error.isConflict;
  return (
    <>
      <ProblemAlert error={error} />
      {conflict && (
        <p className="muted" role="note">
          This item changed since you loaded it. Close and reopen it to get the
          current version, then retry.
        </p>
      )}
    </>
  );
}

export function jsonText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return JSON.stringify(value, null, 2);
}
