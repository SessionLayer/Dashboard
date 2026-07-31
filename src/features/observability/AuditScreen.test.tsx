import { http } from 'msw';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/utils';
import { server } from '../../test/server';
import { cp, page, problem } from '../../test/msw';
import type { AuditEventResource } from '../../api/types';
import { AuditScreen } from './AuditScreen';

const CORR = '99999999-9999-9999-9999-999999999999';

const EVENT: AuditEventResource = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  occurredAt: '2026-07-15T12:00:00Z',
  actor: 'alice',
  action: 'lock.create',
  outcome: 'allow',
  subject: 'node/db-1',
  sourceIp: '10.0.0.1',
  nodeId: '33333333-3333-3333-3333-333333333333',
  correlationId: CORR,
};

const LOGIN: AuditEventResource = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  occurredAt: '2026-07-15T11:59:00Z',
  actor: 'alice',
  action: 'auth.login',
  outcome: 'success',
  correlationId: CORR,
};

function renderScreen(perms = ['audit:read'] as const) {
  renderWithProviders(<AuditScreen />, {
    authenticated: true,
    permissions: [...perms],
  });
}

describe('AuditScreen', () => {
  it('renders search results', async () => {
    server.use(http.get(cp('/v1/audit-events'), () => page([EVENT])));
    renderScreen();
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('lock.create')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    server.use(http.get(cp('/v1/audit-events'), () => page([])));
    renderScreen();
    expect(
      await screen.findByText('No audit events match.'),
    ).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(
      http.get(cp('/v1/audit-events'), () => problem(403, 'Forbidden')),
    );
    renderScreen();
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('renders the full search dimension set as real (non-inert) filters', async () => {
    server.use(http.get(cp('/v1/audit-events'), () => page([])));
    renderScreen();
    await screen.findByText('No audit events match.');
    expect(screen.getByLabelText('Source IP')).toBeInTheDocument();
    expect(screen.getByLabelText('Correlation ID')).toBeInTheDocument();
    expect(
      screen.queryByText(/may return no results today/i),
    ).not.toBeInTheDocument();
  });

  it('sends filter query params on search', async () => {
    let seen = '';
    server.use(
      http.get(cp('/v1/audit-events'), ({ request }) => {
        seen = request.url;
        return page([]);
      }),
    );
    renderScreen();
    await screen.findByText('No audit events match.');

    fireEvent.change(screen.getByLabelText('Actor (identity)'), {
      target: { value: 'carol' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(seen).toContain('actor=carol');
    });
  });

  it('reconstructs the correlated story for a row', async () => {
    server.use(
      http.get(cp('/v1/audit-events'), ({ request }) => {
        const corr = new URL(request.url).searchParams.get('correlationId');
        return corr === CORR ? page([EVENT, LOGIN]) : page([EVENT]);
      }),
    );
    renderScreen();
    await screen.findByText('alice');

    fireEvent.click(screen.getByText('alice'));
    // The dialog shows the whole correlated path in chronological order.
    expect(await screen.findByText('auth.login')).toBeInTheDocument();
    expect(screen.getByText('Correlated path')).toBeInTheDocument();
  });
});
