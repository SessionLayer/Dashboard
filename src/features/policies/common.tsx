import type { ReactNode } from 'react';

import {
  PageHeader,
  Button,
  AsyncList,
  DataTable,
  LoadMore,
  Badge,
  Dialog,
  ProblemAlert,
  LabelMapView,
  type Column,
  type BadgeTone,
} from '../../ui';
import type { CursorListResult } from '../../api/http';
import type {
  JitApprovalLevel,
  LabelMap,
  Origin,
  Selector,
} from '../../api/types';
import { conflictHint } from './helpers';

const ORIGIN_TONE: Record<Origin, BadgeTone> = {
  api: 'info',
  ui: 'accent',
  default: 'neutral',
};

export function OriginBadge({ origin }: { origin: Origin }) {
  return <Badge tone={ORIGIN_TONE[origin]}>{origin}</Badge>;
}

export function SelectorSummary({
  selector,
}: {
  selector: Selector | undefined;
}) {
  const entries = selector ? Object.entries(selector) : [];
  if (entries.length === 0) return <span className="muted">—</span>;
  const labels: LabelMap = Object.fromEntries(
    entries.map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
  );
  return <LabelMapView labels={labels} />;
}

export function ApprovalChainSummary({
  chain,
}: {
  chain: JitApprovalLevel[] | undefined;
}) {
  if (chain === undefined || chain.length === 0) {
    return <span className="muted">auto-approve (0 levels)</span>;
  }
  const levels = chain
    .map((l) =>
      l.kind !== undefined && l.value !== undefined
        ? `${l.kind}:${l.value}`
        : undefined,
    )
    .filter((v): v is string => v !== undefined);
  const suffix = levels.length > 0 ? ` (${levels.join(' → ')})` : '';
  return (
    <span>{`${String(chain.length)} level${chain.length > 1 ? 's' : ''}${suffix}`}</span>
  );
}

export function CrudScreen<T>({
  title,
  description,
  newLabel,
  canWrite,
  onNew,
  list,
  columns,
  rowKey,
  caption,
  emptyTitle,
  onRowClick,
}: {
  title: string;
  description?: ReactNode;
  newLabel: string;
  canWrite: boolean;
  onNew: () => void;
  list: CursorListResult<T>;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  emptyTitle: string;
  onRowClick: (row: T) => void;
}) {
  return (
    <section>
      <PageHeader
        title={title}
        description={description}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={onNew}>
              {newLabel}
            </Button>
          ) : undefined
        }
      />
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
    </section>
  );
}

export function FormDialog({
  title,
  pending,
  error,
  submitLabel = 'Save',
  submitDisabled = false,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  pending: boolean;
  error: unknown;
  submitLabel?: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const hint = conflictHint(error);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            disabled={pending || submitDisabled}
          >
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </>
      }
    >
      {children}
      {error !== undefined && error !== null && <ProblemAlert error={error} />}
      {hint !== undefined && (
        <p className="muted" role="note">
          {hint}
        </p>
      )}
    </Dialog>
  );
}
