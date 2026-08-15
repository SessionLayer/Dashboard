import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, fireEvent, waitFor } from '@testing-library/react';

import { renderWithProviders } from '../../test/utils';
import { server } from '../../test/server';
import { cp, page, ok, problem } from '../../test/msw';
import type { JitPolicyResource } from '../../api/types';
import { JitPoliciesScreen } from './JitPoliciesScreen';

const PATH = '/v1/jit-policies';

function policy(over: Partial<JitPolicyResource> = {}): JitPolicyResource {
  return {
    id: '018f0000-0000-7000-8000-0000000000f1',
    name: 'prod-oncall',
    targetSelector: { env: 'prod' },
    capabilities: ['shell'],
    maxTtlSeconds: 3600,
    approvalChain: [{ kind: 'oidc_group', value: 'sre-leads' }],
    origin: 'api',
    version: 1,
    ...over,
  };
}

const WRITE = { authenticated: true, permissions: ['settings:write' as const] };

describe('JitPoliciesScreen', () => {
  it('lists JIT policies', async () => {
    server.use(http.get(cp(PATH), () => page([policy()])));
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    expect(await screen.findByText('prod-oncall')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    expect(await screen.findByText(/no jit policies/i)).toBeInTheDocument();
  });

  it('shows a loading state before data', () => {
    server.use(
      http.get(cp(PATH), () => new Promise<Response>(() => undefined)),
    );
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('surfaces an RFC 9457 error', async () => {
    server.use(http.get(cp(PATH), () => problem(500, 'Kaboom')));
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    expect(await screen.findByText('Kaboom')).toBeInTheDocument();
  });

  it('handles a 403 gracefully', async () => {
    server.use(http.get(cp(PATH), () => problem(403, 'Forbidden')));
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the New button without settings:write', async () => {
    server.use(http.get(cp(PATH), () => page([policy()])));
    renderWithProviders(<JitPoliciesScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('prod-oncall');
    expect(
      screen.queryByRole('button', { name: /new jit policy/i }),
    ).not.toBeInTheDocument();
  });

  it('creates a JIT policy with selector, capability and approval level', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([])),
      http.post(cp(PATH), async ({ request }) => {
        body = await request.json();
        return ok(policy({ name: 'db-admin' }), 201);
      }),
    );
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    await screen.findByText(/no jit policies/i);

    fireEvent.click(screen.getByRole('button', { name: /new jit policy/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'db-admin' },
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: /target selector/i }),
      {
        target: { value: '{"role":"db"}' },
      },
    );
    fireEvent.change(screen.getByRole('spinbutton', { name: /max ttl/i }), {
      target: { value: '1800' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'exec' }));
    fireEvent.click(
      screen.getByRole('button', { name: /add approval level/i }),
    );
    fireEvent.change(screen.getByRole('combobox', { name: /level 1 kind/i }), {
      target: { value: 'oidc_group' },
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: /level 1 approver/i }),
      {
        target: { value: 'dba-team' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toEqual({
        name: 'db-admin',
        targetSelector: { role: 'db' },
        capabilities: ['exec'],
        maxTtlSeconds: 1800,
        approvalChain: [{ kind: 'oidc_group', value: 'dba-team' }],
      });
    });
  });

  // JIT policies grant from the same full capability
  // vocabulary as rules — the forwarding/X11 capabilities are selectable and
  // land in the submitted payload.
  it('grants the forwarding capabilities through the create payload', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([])),
      http.post(cp(PATH), async ({ request }) => {
        body = await request.json();
        return ok(policy({ name: 'fwd-policy' }), 201);
      }),
    );
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    await screen.findByText(/no jit policies/i);

    fireEvent.click(screen.getByRole('button', { name: /new jit policy/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'fwd-policy' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: /max ttl/i }), {
      target: { value: '900' },
    });
    for (const capability of [
      'port_forward_local',
      'port_forward_remote',
      'x11',
    ]) {
      fireEvent.click(screen.getByRole('checkbox', { name: capability }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect((body as { capabilities: string[] }).capabilities).toEqual([
        'port_forward_local',
        'port_forward_remote',
        'x11',
      ]);
    });
  });

  it('keeps Save disabled until max TTL is positive', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    await screen.findByText(/no jit policies/i);
    fireEvent.click(screen.getByRole('button', { name: /new jit policy/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'x' },
    });
    // Selector defaults to a valid '{}', but TTL is still empty.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: /max ttl/i }), {
      target: { value: '60' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('edits a JIT policy and sends the current version', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([policy({ version: 4 })])),
      http.put(cp(`${PATH}/:id`), async ({ request }) => {
        body = await request.json();
        return ok(policy({ version: 5 }));
      }),
    );
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('prod-oncall'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /max ttl/i }), {
      target: { value: '7200' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toMatchObject({ version: 4, maxTtlSeconds: 7200 });
    });
  });

  it('confirms and deletes a JIT policy', async () => {
    let deleted = false;
    server.use(
      http.get(cp(PATH), () => page([policy()])),
      http.delete(cp(`${PATH}/:id`), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<JitPoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('prod-oncall'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });
});
