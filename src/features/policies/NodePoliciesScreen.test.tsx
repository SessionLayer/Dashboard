import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, fireEvent, waitFor } from '@testing-library/react';

import { renderWithProviders } from '../../test/utils';
import { server } from '../../test/server';
import { cp, page, ok, problem } from '../../test/msw';
import type { NodePolicyResource } from '../../api/types';
import { NodePoliciesScreen } from './NodePoliciesScreen';

const PATH = '/v1/node-policies';

function policy(over: Partial<NodePolicyResource> = {}): NodePolicyResource {
  return {
    id: '018f0000-0000-7000-8000-0000000000e1',
    name: 'default-agentless',
    desiredLabels: { tier: 'edge' },
    connectorKind: 'agentless',
    origin: 'ui',
    version: 1,
    ...over,
  };
}

const WRITE = { authenticated: true, permissions: ['settings:write' as const] };

describe('NodePoliciesScreen', () => {
  it('lists node policies with their label maps', async () => {
    server.use(http.get(cp(PATH), () => page([policy()])));
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    expect(await screen.findByText('default-agentless')).toBeInTheDocument();
    expect(screen.getByText('tier')).toBeInTheDocument();
  });

  it('renders an empty state', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    expect(await screen.findByText(/no node policies/i)).toBeInTheDocument();
  });

  it('shows a loading state before data', () => {
    server.use(
      http.get(cp(PATH), () => new Promise<Response>(() => undefined)),
    );
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('surfaces an RFC 9457 error', async () => {
    server.use(http.get(cp(PATH), () => problem(503, 'Unavailable')));
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
  });

  it('handles a 403 gracefully', async () => {
    server.use(http.get(cp(PATH), () => problem(403, 'Forbidden')));
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the New button without settings:write', async () => {
    server.use(http.get(cp(PATH), () => page([policy()])));
    renderWithProviders(<NodePoliciesScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('default-agentless');
    expect(
      screen.queryByRole('button', { name: /new node policy/i }),
    ).not.toBeInTheDocument();
  });

  it('creates a node policy (name, connector, labels sent)', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([])),
      http.post(cp(PATH), async ({ request }) => {
        body = await request.json();
        return ok(policy({ name: 'edge-agent' }), 201);
      }),
    );
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    await screen.findByText(/no node policies/i);

    fireEvent.click(screen.getByRole('button', { name: /new node policy/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'edge-agent' },
    });
    fireEvent.change(
      screen.getByRole('combobox', { name: /connector kind/i }),
      {
        target: { value: 'agent' },
      },
    );
    fireEvent.change(screen.getByRole('textbox', { name: /desired labels/i }), {
      target: { value: '{"env":"prod"}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toEqual({
        name: 'edge-agent',
        connectorKind: 'agent',
        desiredLabels: { env: 'prod' },
      });
    });
  });

  it('keeps Save disabled while the labels JSON is invalid', async () => {
    server.use(http.get(cp(PATH), () => page([])));
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    await screen.findByText(/no node policies/i);
    fireEvent.click(screen.getByRole('button', { name: /new node policy/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /^name/i }), {
      target: { value: 'x' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /desired labels/i }), {
      target: { value: '{not json' },
    });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('edits a node policy and sends the current version', async () => {
    let body: unknown;
    server.use(
      http.get(cp(PATH), () => page([policy({ version: 9 })])),
      http.put(cp(`${PATH}/:id`), async ({ request }) => {
        body = await request.json();
        return ok(policy({ version: 10 }));
      }),
    );
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('default-agentless'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: /host pin ref/i }), {
      target: { value: 'pin-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(body).toMatchObject({ version: 9, hostPinRef: 'pin-123' });
    });
  });

  it('confirms and deletes a node policy', async () => {
    let deleted = false;
    server.use(
      http.get(cp(PATH), () => page([policy()])),
      http.delete(cp(`${PATH}/:id`), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<NodePoliciesScreen />, WRITE);
    fireEvent.click(await screen.findByText('default-agentless'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });
});
