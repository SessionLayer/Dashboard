import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cp, ok, problem } from '../../test/msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import type { IssuedJoinToken, JoinTokenResource } from '../../api/types';
import { JoinTokenList } from './JoinTokenList';

const tokens: JoinTokenResource[] = [
  {
    id: 't1',
    nodeName: 'worker-07',
    joinMethod: 'token',
    singleUse: true,
    expiresAt: '2026-07-16T12:00:00Z',
    createdAt: '2026-07-16T11:00:00Z',
    createdBy: 'admin@test',
  },
];

function listTokens(rows: JoinTokenResource[] = tokens) {
  server.use(http.get(cp('/v1/join-tokens'), () => ok({ joinTokens: rows })));
}

describe('JoinTokenList', () => {
  it('lists join tokens with scope, single-use, and expiry', async () => {
    listTokens();
    renderWithProviders(<JoinTokenList />, {
      authenticated: true,
      permissions: ['node:enroll'],
    });

    expect(await screen.findByText('worker-07')).toBeInTheDocument();
    expect(screen.getByText('token')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('issues a token and reveals the one-time secret', async () => {
    listTokens();
    let body: { nodeName: string } | undefined;
    server.use(
      http.post(cp('/v1/join-tokens'), async ({ request }) => {
        body = (await request.json()) as { nodeName: string };
        const issued: IssuedJoinToken = {
          id: 't2',
          token: 'sl-join-secret-abc123',
          nodeName: body.nodeName,
          joinMethod: 'token',
          singleUse: true,
          expiresAt: '2026-07-16T12:30:00Z',
        };
        return ok(issued, 201);
      }),
    );
    renderWithProviders(<JoinTokenList />, {
      authenticated: true,
      permissions: ['node:enroll'],
    });

    await screen.findByText('worker-07');
    fireEvent.click(screen.getByRole('button', { name: 'Issue token…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Node name/), {
      target: { value: 'worker-09' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Issue token' }),
    );

    expect(
      await screen.findByText('sl-join-secret-abc123'),
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot be retrieved again/)).toBeInTheDocument();
    expect(body?.nodeName).toBe('worker-09');
  });

  it('revokes a token behind a confirm dialog', async () => {
    listTokens();
    let revoked = false;
    server.use(
      http.delete(cp('/v1/join-tokens/t1'), () => {
        revoked = true;
        return new Response(null, { status: 204 });
      }),
    );
    renderWithProviders(<JoinTokenList />, {
      authenticated: true,
      permissions: ['node:enroll'],
    });

    await screen.findByText('worker-07');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revoked).toBe(true);
    });
  });

  it('renders an empty state when there are no tokens', async () => {
    listTokens([]);
    renderWithProviders(<JoinTokenList />, {
      authenticated: true,
      permissions: ['node:enroll'],
    });
    expect(
      await screen.findByText('No active join tokens.'),
    ).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem on failure', async () => {
    server.use(http.get(cp('/v1/join-tokens'), () => problem(500, 'Kaboom')));
    renderWithProviders(<JoinTokenList />, {
      authenticated: true,
      permissions: ['node:enroll'],
    });
    expect(await screen.findByText('Kaboom')).toBeInTheDocument();
  });

  it('renders a 403 as a not-permitted message', async () => {
    server.use(http.get(cp('/v1/join-tokens'), () => problem(403, 'Nope')));
    renderWithProviders(<JoinTokenList />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides issue/revoke without node:enroll', async () => {
    listTokens();
    renderWithProviders(<JoinTokenList />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('worker-07');
    expect(
      screen.queryByRole('button', { name: 'Issue token…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke' }),
    ).not.toBeInTheDocument();
  });
});
