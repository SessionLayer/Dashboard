import type { ReactNode } from 'react';

import { Button } from './Button';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  onRowClick?: (row: T) => void;
}

/**
 * The table primitive. Always wrapped in an `overflow-x:auto` container so wide
 * tables scroll within themselves and never push a horizontal scrollbar onto the
 * page body (a11y/responsive rule). Every table carries a caption.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.header}
                scope="col"
                style={{
                  textAlign: c.align ?? 'left',
                  width: c.width,
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const clickable = onRowClick !== undefined;
            return (
              <tr
                key={rowKey(row)}
                className={clickable ? 'row-clickable' : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={
                  clickable
                    ? () => {
                        onRowClick(row);
                      }
                    : undefined
                }
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.header} style={{ textAlign: c.align ?? 'left' }}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}): ReactNode {
  if (!hasNextPage) return null;
  return (
    <div className="load-more">
      <Button onClick={onLoadMore} disabled={isFetchingNextPage}>
        {isFetchingNextPage ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}
