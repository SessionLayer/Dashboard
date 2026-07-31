import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { cp, ok, problem } from '../../test/msw';
import { renderWithProviders } from '../../test/utils';
import { LockList } from './LockList';

function lock(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f0000-0000-7000-8000-0000000000a1',
    target: { identities: ['mallory@corp.example'] },
    reason: 'Suspected credential theft',
    createdAt: '2026-07-16T08:00:00Z',
    createdBy: 'ir@corp.example',
    ...overrides,
  };
}

const WRITE = ['lock:read', 'lock:write'] as const;

describe('LockList', () => {
  it('lists active locks and summarises the target', async () => {
    server.use(http.get(cp('/v1/locks'), () => ok({ locks: [lock()] })));
    renderWithProviders(<LockList />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(
      await screen.findByText('Suspected credential theft'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/identities: mallory@corp\.example/),
    ).toBeInTheDocument();
    // "Kind" is derived from which target facet is populated (no separate
    // contract field) — an identities-only target reads as "identity".
    expect(screen.getByText('identity')).toBeInTheDocument();
  });

  it('derives Kind "fleet-wide" for an all:true target', async () => {
    server.use(
      http.get(cp('/v1/locks'), () =>
        ok({ locks: [lock({ target: { all: true }, reason: 'Incident' })] }),
      ),
    );
    renderWithProviders(<LockList />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    await screen.findByText('Incident');
    expect(screen.getByText('fleet-wide')).toBeInTheDocument();
  });

  it('shows an empty state when there are no locks', async () => {
    server.use(http.get(cp('/v1/locks'), () => ok({ locks: [] })));
    renderWithProviders(<LockList />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('No active locks.')).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 error', async () => {
    server.use(
      http.get(cp('/v1/locks'), () => problem(503, 'Service Unavailable')),
    );
    renderWithProviders(<LockList />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('Service Unavailable')).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(http.get(cp('/v1/locks'), () => problem(403, 'Forbidden')));
    renderWithProviders(<LockList />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('creates a fleet-wide lock, then releases it', async () => {
    let locks: ReturnType<typeof lock>[] = [];
    const created = lock({
      id: '018f0000-0000-7000-8000-0000000000a9',
      target: { all: true },
      reason: 'Active incident',
    });
    server.use(
      http.get(cp('/v1/locks'), () => ok({ locks })),
      http.post(cp('/v1/locks'), () => {
        locks = [created];
        return ok(created, 201);
      }),
      http.delete(cp('/v1/locks/:id'), () => {
        locks = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<LockList />, {
      authenticated: true,
      permissions: [...WRITE],
    });

    expect(await screen.findByText('No active locks.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New lock…' }));
    fireEvent.click(
      screen.getByLabelText('Fleet-wide (deny everything)', { exact: false }),
    );
    fireEvent.change(screen.getByLabelText('Reason', { exact: false }), {
      target: { value: 'Active incident' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create lock' }));

    await waitFor(() => {
      expect(screen.getByText('Active incident')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Release' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Release' }));

    await waitFor(() => {
      expect(screen.getByText('No active locks.')).toBeInTheDocument();
    });
  });

  it('hides create/release without lock:write', async () => {
    server.use(http.get(cp('/v1/locks'), () => ok({ locks: [lock()] })));
    renderWithProviders(<LockList />, {
      authenticated: true,
      permissions: ['lock:read'],
    });
    await screen.findByText('Suspected credential theft');
    expect(
      screen.queryByRole('button', { name: 'New lock…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release' }),
    ).not.toBeInTheDocument();
  });
});
