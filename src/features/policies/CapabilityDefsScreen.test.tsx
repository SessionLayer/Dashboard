import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, fireEvent, waitFor } from '@testing-library/react';

import { renderWithProviders } from '../../test/utils';
import { server } from '../../test/server';
import { cp, page, ok, problem } from '../../test/msw';
import type { CapabilityDefResource } from '../../api/types';
import { CapabilityDefsScreen } from './CapabilityDefsScreen';

const PATH = '/v1/capability-defs';

function def(over: Partial<CapabilityDefResource> = {}): CapabilityDefResource {
  return {
    id: '018f0000-0000-7000-8000-0000000000c1',
    name: 'shell',
    description: 'Interactive shell.',
    origin: 'default',
    version: 1,
    ...over,
  };
}

const WRITE = { authenticated: true, permissions: ['settings:write' as const] };

describe('CapabilityDefsScreen', () => {
  it('lists capability definitions', async () => {
    server.use(http.get(cp(PATH), () => page([def({ name: 'sftp' })])));
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    expect(await screen.findByText('sftp')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    expect(
      await screen.findByText(/no capability definitions/i),
    ).toBeInTheDocument();
  });

  it('shows a loading state before data', () => {
    server.use(
      http.get(cp(PATH), () => new Promise<Response>(() => undefined)),
    );
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('surfaces an RFC 9457 error', async () => {
    server.use(
      http.get(cp(PATH), () => problem(500, 'Boom', 'Backend unavailable')),
    );
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    expect(await screen.findByText('Boom')).toBeInTheDocument();
  });

  it('handles a 403 gracefully', async () => {
    server.use(http.get(cp(PATH), () => problem(403, 'Forbidden')));
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the New button without settings:write', async () => {
    server.use(http.get(cp(PATH), () => page([def()])));
    renderWithProviders(<CapabilityDefsScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('shell');
    expect(
      screen.queryByRole('button', { name: /new capability/i }),
    ).not.toBeInTheDocument();
  });

  it('creates a capability (idempotency key + name sent)', async () => {
    let body: unknown;
    let idem: string | null = null;
    server.use(
      http.get(cp(PATH), () => page([])),
      http.post(cp(PATH), async ({ request }) => {
        body = await request.json();
        idem = request.headers.get('Idempotency-Key');
        return ok(def({ name: 'exec' }), 201);
      }),
    );
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    await screen.findByText(/no capability definitions/i);

    fireEvent.click(screen.getByRole('button', { name: /new capability/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /capability/i }), {
      target: { value: 'exec' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'One-shot command.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toEqual({ name: 'exec', description: 'One-shot command.' });
    });
    expect(idem).toBeTruthy();
  });

  it('edits a capability and sends the current version', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([def({ version: 7 })])),
      http.put(cp(`${PATH}/:id`), async ({ request }) => {
        body = await request.json();
        return ok(def({ version: 8 }));
      }),
    );
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    fireEvent.click(await screen.findByText('shell'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Updated.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toEqual({ description: 'Updated.', version: 7 });
    });
  });

  it('confirms and deletes a capability', async () => {
    let deleted = false;
    server.use(
      http.get(cp(PATH), () => page([def()])),
      http.delete(cp(`${PATH}/:id`), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    fireEvent.click(await screen.findByText('shell'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });

  it('shows a conflict hint on a stale-version 409', async () => {
    server.use(
      http.get(cp(PATH), () => page([def({ version: 2 })])),
      http.put(cp(`${PATH}/:id`), () =>
        problem(409, 'Version conflict', 'The record changed.'),
      ),
    );
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    fireEvent.click(await screen.findByText('shell'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/close and reopen/i)).toBeInTheDocument();
  });

  it('paginates via Load more', async () => {
    let call = 0;
    server.use(
      http.get(cp(PATH), () => {
        call += 1;
        return call === 1
          ? page([def({ id: 'p1', name: 'shell' })], 'CUR2')
          : page([def({ id: 'p2', name: 'sftp' })]);
      }),
    );
    renderWithProviders(<CapabilityDefsScreen />, WRITE);
    await screen.findByText('shell');
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(await screen.findByText('sftp')).toBeInTheDocument();
  });
});
