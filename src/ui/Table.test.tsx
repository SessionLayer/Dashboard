import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type Column } from './Table';

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [{ header: 'Name', cell: (r) => r.name }];
const rows: Row[] = [{ id: '1', name: 'alpha' }];

describe('DataTable clickable rows are keyboard-operable', () => {
  it('activates a row on click, Enter, and Space', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        caption="rows"
        onRowClick={onRowClick}
      />,
    );
    const row = screen.getByRole('button', { name: /alpha/ });
    expect(row).toHaveAttribute('tabindex', '0');

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(3);
  });

  it('does not make rows interactive without onRowClick', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        caption="rows"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
