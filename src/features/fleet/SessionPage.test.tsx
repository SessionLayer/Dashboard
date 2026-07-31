import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cp, ok, page, problem } from '../../test/msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import type { SessionResource, TerminateSessionRequest } from '../../api/types';
import { SessionPage } from './SessionPage';

function session(
  over: Partial<SessionResource> & { id: string; identity: string },
): SessionResource {
  return {
    principal: 'deploy',
    accessModel: 'standing',
    capabilities: ['shell'],
    startedAt: '2026-07-16T10:00:00Z',
    ...over,
  };
}

const alice = session({
  id: 's1',
  identity: 'alice@corp',
  nodeName: 'web-01',
  accessModel: 'standing',
});
const bob = session({
  id: 's2',
  identity: 'bob@corp',
  nodeName: 'db-01',
  accessModel: 'jit',
  capabilities: ['shell', 'sftp'],
  endedAt: '2026-07-16T10:45:00Z',
  endReason: 'client disconnect',
});

const RW = ['audit:read', 'lock:write'] as const;

describe('SessionPage', () => {
  it('lists sessions with access badges and paginates', async () => {
    server.use(
      http.get(cp('/v1/sessions'), ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return cursor === null ? page([alice], 'CUR2') : page([bob]);
      }),
    );
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: [...RW],
    });

    expect(await screen.findByText('alice@corp')).toBeInTheDocument();
    expect(screen.getByText('standing')).toBeInTheDocument();

    const loadMore = screen.getByRole('button', { name: 'Load more' });
    fireEvent.click(loadMore);

    expect(await screen.findByText('bob@corp')).toBeInTheDocument();
    expect(screen.getByText('jit')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Load more' }),
    ).not.toBeInTheDocument();
  });

  it('shows capabilities and a derived duration per session', async () => {
    server.use(
      http.get(cp('/v1/sessions'), () =>
        page([
          session({
            id: 's3',
            identity: 'carol@corp',
            capabilities: ['shell', 'exec'],
            startedAt: '2026-07-16T10:00:00Z',
            endedAt: '2026-07-16T10:01:30Z',
          }),
        ]),
      ),
    );
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: [...RW],
    });

    await screen.findByText('carol@corp');
    expect(screen.getByText('shell')).toBeInTheDocument();
    expect(screen.getByText('exec')).toBeInTheDocument();
    // 90s between started/ended, purely derived from the two real timestamps.
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it('offers Terminate only for active sessions', async () => {
    server.use(http.get(cp('/v1/sessions'), () => page([alice, bob])));
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: [...RW],
    });

    await screen.findByText('alice@corp');
    // bob has ended → only alice's session is terminable
    expect(screen.getAllByRole('button', { name: 'Terminate' })).toHaveLength(
      1,
    );
  });

  it('terminates an active session with an idempotency key', async () => {
    server.use(http.get(cp('/v1/sessions'), () => page([alice])));
    let body: TerminateSessionRequest | undefined;
    let idem: string | null = null;
    server.use(
      http.post(cp('/v1/sessions/s1/terminate'), async ({ request }) => {
        idem = request.headers.get('Idempotency-Key');
        body = (await request.json()) as TerminateSessionRequest;
        return ok(alice, 202);
      }),
    );
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: [...RW],
    });

    await screen.findByText('alice@corp');
    fireEvent.click(screen.getByRole('button', { name: 'Terminate' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), {
      target: { value: 'incident 42' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Terminate' }));

    await waitFor(() => {
      expect(body).toBeDefined();
    });
    expect(body?.reason).toBe('incident 42');
    expect(idem).not.toBeNull();
  });

  it('opens session detail via getSession', async () => {
    server.use(http.get(cp('/v1/sessions'), () => page([bob])));
    server.use(http.get(cp('/v1/sessions/s2'), () => ok(bob)));
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: [...RW],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'bob@corp' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Session detail')).toBeInTheDocument();
    expect(
      await within(dialog).findByText('client disconnect'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('sftp')).toBeInTheDocument();
  });

  it('renders an empty state when no sessions match', async () => {
    server.use(http.get(cp('/v1/sessions'), () => page([])));
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: [...RW],
    });
    expect(await screen.findByText('No sessions match.')).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem on failure', async () => {
    server.use(http.get(cp('/v1/sessions'), () => problem(500, 'Boom')));
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: [...RW],
    });
    expect(await screen.findByText('Boom')).toBeInTheDocument();
  });

  it('renders a 403 as a not-permitted message', async () => {
    server.use(http.get(cp('/v1/sessions'), () => problem(403, 'Forbidden')));
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides Terminate without lock:write', async () => {
    server.use(http.get(cp('/v1/sessions'), () => page([alice])));
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('alice@corp');
    expect(
      screen.queryByRole('button', { name: 'Terminate' }),
    ).not.toBeInTheDocument();
  });

  it('sends the access-model filter to the server', async () => {
    let lastAccess: string | null = null;
    server.use(
      http.get(cp('/v1/sessions'), ({ request }) => {
        lastAccess = new URL(request.url).searchParams.get('accessModel');
        return page([alice]);
      }),
    );
    renderWithProviders(<SessionPage />, {
      authenticated: true,
      permissions: [...RW],
    });

    await screen.findByText('alice@corp');
    fireEvent.change(screen.getByLabelText(/^Access model/), {
      target: { value: 'jit' },
    });
    await waitFor(() => {
      expect(lastAccess).toBe('jit');
    });
  });
});
