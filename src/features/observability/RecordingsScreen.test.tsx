import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/utils';
import { server } from '../../test/server';
import { cp, ok, page, problem } from '../../test/msw';
import type { RecordingResource } from '../../api/types';
import { RecordingsScreen } from './RecordingsScreen';

const REC: RecordingResource = {
  id: '11111111-1111-1111-1111-111111111111',
  sessionId: '22222222-2222-2222-2222-222222222222',
  identity: 'alice',
  nodeId: '33333333-3333-3333-3333-333333333333',
  format: 'asciicast-v2',
  status: 'finalized',
  wormMode: 'compliance',
  sizeBytes: 4096,
  legalHold: false,
  retentionUntil: '2027-01-01T00:00:00Z',
  startedAt: '2026-07-01T00:00:00Z',
  createdAt: '2026-07-01T00:05:00Z',
};

describe('RecordingsScreen', () => {
  it('lists recordings', async () => {
    server.use(http.get(cp('/v1/recordings'), () => page([REC])));
    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('finalized')).toBeInTheDocument();
    // "Created" (createdAt) is distinct from "Started" (session start) —
    // both real contract fields, both shown.
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByTitle('2026-07-01T00:05:00.000Z')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    server.use(http.get(cp('/v1/recordings'), () => page([])));
    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });
    expect(await screen.findByText('No recordings match.')).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(http.get(cp('/v1/recordings'), () => problem(403, 'Forbidden')));
    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem', async () => {
    server.use(
      http.get(cp('/v1/recordings'), () =>
        problem(500, 'Storage unavailable', 'object store down'),
      ),
    );
    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });
    expect(await screen.findByText('Storage unavailable')).toBeInTheDocument();
  });

  it('hides replay/export actions without the permission', async () => {
    server.use(http.get(cp('/v1/recordings'), () => page([REC])));
    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['audit:read'], // known, but not recording:*
    });
    await screen.findByText('alice');
    expect(screen.queryByRole('button', { name: 'Replay' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
  });

  it('sends filter query params on search', async () => {
    let seen = '';
    server.use(
      http.get(cp('/v1/recordings'), ({ request }) => {
        seen = request.url;
        return page([]);
      }),
    );
    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay'],
    });
    await screen.findByText('No recordings match.');

    fireEvent.change(screen.getByLabelText('Identity'), {
      target: { value: 'bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(seen).toContain('identity=bob');
    });
  });

  it('confirms and issues a governance delete', async () => {
    let deleted = false;
    server.use(
      http.get(cp('/v1/recordings'), () => page([REC])),
      http.delete(cp('/v1/recordings/:id'), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay', 'recording:delete'],
    });
    await screen.findByText('alice');

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete…' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete recording' }),
    );
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });

  it('places a legal hold with a reason', async () => {
    let body: { held?: boolean; reason?: string } | undefined;
    server.use(
      http.get(cp('/v1/recordings'), () => page([REC])),
      http.put(cp('/v1/recordings/:id/legal-hold'), async ({ request }) => {
        body = (await request.json()) as { held?: boolean; reason?: string };
        return ok({ ...REC, legalHold: true });
      }),
    );
    renderWithProviders(<RecordingsScreen />, {
      authenticated: true,
      permissions: ['recording:replay', 'recording:delete'],
    });
    await screen.findByText('alice');

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Place legal hold' }),
    );
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'litigation-42' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Place hold' }));

    await waitFor(() => {
      expect(body?.held).toBe(true);
    });
    expect(body?.reason).toBe('litigation-42');
  });
});
