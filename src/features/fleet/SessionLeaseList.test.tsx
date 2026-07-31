import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cp, ok, page, problem } from '../../test/msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import type {
  PlatformPermission,
  ReleaseSessionLeaseRequest,
  SessionLeaseResource,
} from '../../api/types';
import { SessionLeaseList } from './SessionLeaseList';

const live: SessionLeaseResource = {
  id: 'l1',
  identity: 'alice@corp',
  sessionId: '018f9c00-0000-7000-8000-0000000000c1',
  gatewayName: 'gw-eu-1',
  acquiredAt: '2026-07-16T10:30:00Z',
  expiresAt: '2999-01-01T00:00:00Z',
  countsTowardCap: true,
};

// The case the screen exists for: still counted, held by a Gateway that is gone,
// and the session row it belonged to already pruned — which the contract calls a
// sign of a stuck lease. Note it is NOT expired: the cap counts unreleased AND
// unexpired, so an expired lease has already stopped occupying its slot.
const ghost: SessionLeaseResource = {
  id: 'l2',
  identity: 'bob@corp',
  gatewayName: 'gw-departed',
  acquiredAt: '2026-01-01T00:00:00Z',
  expiresAt: '2999-01-01T00:00:00Z',
  countsTowardCap: true,
};

// Expired, and therefore already uncounted; `releasedAt` only catches up later.
const expired: SessionLeaseResource = {
  id: 'l3',
  identity: 'carol@corp',
  sessionId: '018f9c00-0000-7000-8000-0000000000c3',
  gatewayName: 'gw-eu-1',
  acquiredAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-01T01:00:00Z',
  countsTowardCap: false,
};

// No TTL at all: counts until something releases it — the unbounded case.
const noTtl: SessionLeaseResource = {
  id: 'l4',
  identity: 'dave@corp',
  sessionId: '018f9c00-0000-7000-8000-0000000000c4',
  gatewayName: 'gw-eu-1',
  acquiredAt: '2026-01-01T00:00:00Z',
  countsTowardCap: true,
};

function mount(
  rows: SessionLeaseResource[] = [live, ghost],
  permissions: PlatformPermission[] = ['audit:read', 'lock:write'],
) {
  server.use(http.get(cp('/v1/session-leases'), () => page(rows)));
  renderWithProviders(<SessionLeaseList />, {
    authenticated: true,
    permissions,
  });
}

describe('SessionLeaseList', () => {
  it('marks a counted lease whose session row is gone', async () => {
    mount();
    expect(await screen.findByText('bob@corp')).toBeInTheDocument();
    expect(screen.getByText('yes — no session row')).toBeInTheDocument();
    // A live lease is counted too, but it is not a fault.
    expect(screen.getByText('yes')).toBeInTheDocument();
    expect(screen.getByText(/session row gone/)).toBeInTheDocument();
  });

  // The cap counts unreleased AND unexpired, so "expired but still counted" is a
  // state the API cannot report. An indicator built on `expiresAt` would fire on
  // nothing and quietly imply the wrong diagnosis.
  it('does not treat an expired, uncounted lease as a fault', async () => {
    mount([expired]);
    expect(await screen.findByText('carol@corp')).toBeInTheDocument();
    expect(screen.getByText('no')).toBeInTheDocument();
    expect(
      screen.queryByText(/expired, not yet reaped/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no session row/)).not.toBeInTheDocument();
    // Nothing to release: it already stopped occupying its slot.
    expect(
      screen.queryByRole('button', { name: 'Release' }),
    ).not.toBeInTheDocument();
  });

  it('calls out a lease with no TTL as counting until released', async () => {
    mount([noTtl]);
    expect(await screen.findByText('dave@corp')).toBeInTheDocument();
    expect(
      screen.getByText('no TTL — counts until released'),
    ).toBeInTheDocument();
  });

  it('tells the operator the comparison that finds an over-count', async () => {
    mount();
    await screen.findByText('bob@corp');
    expect(
      screen.getByText(/an expired one has already stopped counting/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/compare the count against the same identity/),
    ).toBeInTheDocument();
  });

  it('defaults to the leases that are actually holding slots', async () => {
    let queried: string | null = null;
    server.use(
      http.get(cp('/v1/session-leases'), ({ request }) => {
        queried = new URL(request.url).searchParams.get('activeOnly');
        return page([live]);
      }),
    );
    renderWithProviders(<SessionLeaseList />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('alice@corp');
    expect(queried).toBe('true');
  });

  it('releases one lease with a required, audited reason', async () => {
    mount();
    let body: ReleaseSessionLeaseRequest | undefined;
    server.use(
      http.post(cp('/v1/session-leases/l2/release'), async ({ request }) => {
        body = (await request.json()) as ReleaseSessionLeaseRequest;
        return ok({ ...ghost, countsTowardCap: false, releasedAt: 'now' });
      }),
    );
    await screen.findByText('bob@corp');

    const row = screen.getByText('bob@corp').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: 'Release' }),
    );

    const dialog = screen.getByRole('dialog');
    // No reason yet — the release is not armed.
    expect(
      within(dialog).getByRole('button', { name: 'Release lease' }),
    ).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/^Reason/), {
      target: { value: 'gateway gw-departed was decommissioned' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Release lease' }),
    );

    await waitFor(() => {
      expect(body).toBeDefined();
    });
    expect(body?.reason).toBe('gateway gw-departed was decommissioned');
  });

  it('warns that releasing a live lease grants capacity over the cap', async () => {
    mount();
    const row = (await screen.findByText('alice@corp')).closest('tr');
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: 'Release' }),
    );
    expect(screen.getByText(/capacity above their cap/)).toBeInTheDocument();
    expect(screen.getByText(/no bulk release/)).toBeInTheDocument();
  });

  it('offers no release without lock:write', async () => {
    mount([live, ghost], ['audit:read']);
    await screen.findByText('bob@corp');
    expect(
      screen.queryByRole('button', { name: 'Release' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces a problem from the release', async () => {
    mount();
    server.use(
      http.post(cp('/v1/session-leases/l2/release'), () =>
        problem(404, 'No such lease', 'It was reaped already.'),
      ),
    );
    await screen.findByText('bob@corp');
    const row = screen.getByText('bob@corp').closest('tr');
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: 'Release' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), {
      target: { value: 'stuck' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Release lease' }),
    );

    expect(await screen.findByText('No such lease')).toBeInTheDocument();
  });

  it('renders an empty state when nothing is holding a slot', async () => {
    mount([]);
    expect(await screen.findByText('No leases match.')).toBeInTheDocument();
  });
});
