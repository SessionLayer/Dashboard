import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, fireEvent, waitFor } from '@testing-library/react';

import { renderWithProviders } from '../../test/utils';
import { server } from '../../test/server';
import { cp, page, ok, problem } from '../../test/msw';
import type { SessionLimitPolicyResource } from '../../api/types';
import { SessionLimitPoliciesScreen } from './SessionLimitPoliciesScreen';

const PATH = '/v1/session-limit-policies';

function policy(
  over: Partial<SessionLimitPolicyResource> = {},
): SessionLimitPolicyResource {
  return {
    id: '018f0000-0000-7000-8000-0000000000d1',
    name: 'sre-oncall-cap',
    identitySelector: { team: 'sre' },
    maxConcurrentSessions: 3,
    maxSessionSeconds: 28800,
    origin: 'api',
    version: 1,
    ...over,
  };
}

const WRITE = { authenticated: true, permissions: ['settings:write' as const] };

describe('SessionLimitPoliciesScreen', () => {
  it('lists session-limit policies with their knobs and selector', async () => {
    server.use(http.get(cp(PATH), () => page([policy()])));
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    expect(await screen.findByText('sre-oncall-cap')).toBeInTheDocument();
    expect(screen.getByText('team')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the cluster-default hint for an absent knob', async () => {
    server.use(
      http.get(cp(PATH), () =>
        page([policy({ maxConcurrentSessions: undefined })]),
      ),
    );
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    await screen.findByText('sre-oncall-cap');
    expect(screen.getAllByText(/cluster default/i).length).toBeGreaterThan(0);
  });

  it('renders an empty state', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    expect(
      await screen.findByText(/no session-limit policies/i),
    ).toBeInTheDocument();
  });

  it('shows a loading state before data', () => {
    server.use(
      http.get(cp(PATH), () => new Promise<Response>(() => undefined)),
    );
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('surfaces an RFC 9457 error', async () => {
    server.use(http.get(cp(PATH), () => problem(503, 'Unavailable')));
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
  });

  it('handles a 403 gracefully', async () => {
    server.use(http.get(cp(PATH), () => problem(403, 'Forbidden')));
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the New button without settings:write', async () => {
    server.use(http.get(cp(PATH), () => page([policy()])));
    renderWithProviders(<SessionLimitPoliciesScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('sre-oncall-cap');
    expect(
      screen.queryByRole('button', { name: /new session-limit policy/i }),
    ).not.toBeInTheDocument();
  });

  it('creates a session-limit policy (name, selector, knobs sent)', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([])),
      http.post(cp(PATH), async ({ request }) => {
        body = await request.json();
        return ok(policy({ name: 'edge-cap' }), 201);
      }),
    );
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    await screen.findByText(/no session-limit policies/i);

    fireEvent.click(
      screen.getByRole('button', { name: /new session-limit policy/i }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'edge-cap' },
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: /identity selector/i }),
      { target: { value: '{"region":"edge"}' } },
    );
    fireEvent.change(
      screen.getByRole('spinbutton', { name: /max concurrent sessions/i }),
      { target: { value: '2' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toEqual({
        name: 'edge-cap',
        identitySelector: { region: 'edge' },
        maxConcurrentSessions: 2,
        maxSessionSeconds: undefined,
        idleTimeoutSeconds: undefined,
      });
    });
  });

  it('keeps Save disabled until at least one knob is set', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    await screen.findByText(/no session-limit policies/i);
    fireEvent.click(
      screen.getByRole('button', { name: /new session-limit policy/i }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'x' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(
      screen.getByRole('spinbutton', { name: /idle timeout/i }),
      { target: { value: '900' } },
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('keeps Save disabled while the selector JSON is invalid', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    await screen.findByText(/no session-limit policies/i);
    fireEvent.click(
      screen.getByRole('button', { name: /new session-limit policy/i }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'x' },
    });
    fireEvent.change(
      screen.getByRole('spinbutton', { name: /idle timeout/i }),
      { target: { value: '900' } },
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: /identity selector/i }),
      { target: { value: '{not json' } },
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('edits a session-limit policy and sends the current version', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([policy({ version: 9 })])),
      http.put(cp(`${PATH}/:id`), async ({ request }) => {
        body = await request.json();
        return ok(policy({ version: 10 }));
      }),
    );
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('sre-oncall-cap'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(
      screen.getByRole('spinbutton', { name: /max concurrent sessions/i }),
      { target: { value: '5' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toMatchObject({ version: 9, maxConcurrentSessions: 5 });
    });
  });

  it('surfaces a 409 stale-version conflict with a hint to reopen', async () => {
    server.use(
      http.get(cp(PATH), () => page([policy({ version: 9 })])),
      http.put(cp(`${PATH}/:id`), () => problem(409, 'Version conflict')),
    );
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('sre-oncall-cap'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Version conflict')).toBeInTheDocument();
    expect(
      screen.getByText(/changed since you opened it/i),
    ).toBeInTheDocument();
  });

  it('confirms and deletes a session-limit policy', async () => {
    let deleted = false;
    server.use(
      http.get(cp(PATH), () => page([policy()])),
      http.delete(cp(`${PATH}/:id`), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<SessionLimitPoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('sre-oncall-cap'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });
});
