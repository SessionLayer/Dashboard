import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import { cp, page, problem } from '../../test/msw';
import type { RuleResource } from '../../api/types';
import { RulesScreen } from './RulesScreen';

const rule = (over: Partial<RuleResource> = {}): RuleResource => ({
  id: '11111111-1111-1111-1111-111111111111',
  name: 'prod-shell',
  identitySelector: { groups: ['sre'] },
  nodeLabelSelector: { env: 'prod' },
  principals: ['root'],
  ttlSeconds: 3600,
  capabilities: ['shell'],
  effect: 'allow',
  origin: 'api',
  version: 5,
  ...over,
});

const WRITE = ['rbac:read', 'rbac:write'] as const;

describe('RulesScreen', () => {
  it('renders a page of rules', async () => {
    server.use(http.get(cp('/v1/rules'), () => page([rule()])));
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('prod-shell')).toBeInTheDocument();
  });

  it('shows a loading state before the list resolves', () => {
    server.use(http.get(cp('/v1/rules'), () => page([rule()])));
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
  });

  it('shows an empty state', async () => {
    server.use(http.get(cp('/v1/rules'), () => page([])));
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem on a failed list', async () => {
    server.use(
      http.get(cp('/v1/rules'), () => problem(500, 'Server exploded')),
    );
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  it('renders a 403 as a not-permitted message', async () => {
    server.use(http.get(cp('/v1/rules'), () => problem(403, 'Forbidden')));
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: ['rbac:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the create action without rbac:write', async () => {
    server.use(http.get(cp('/v1/rules'), () => page([rule()])));
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: ['rbac:read'],
    });
    await screen.findByText('prod-shell');
    expect(
      screen.queryByRole('button', { name: 'New rule…' }),
    ).not.toBeInTheDocument();
  });

  it('creates a rule', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/rules'), () => page([rule()])),
      http.post(cp('/v1/rules'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(rule({ name: 'new-rule' }), { status: 201 });
      }),
    );
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    await screen.findByText('prod-shell');
    fireEvent.click(screen.getByRole('button', { name: 'New rule…' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'new-rule' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }));
    await waitFor(() => {
      expect(body?.name).toBe('new-rule');
    });
  });

  // The CP grant is the sole switch for forwarding/X11 — every
  // capability in the contract vocabulary is grantable here and actually lands
  // in the submitted payload, not just rendered.
  it('grants all eight capabilities through the create payload', async () => {
    const allCapabilities = [
      'shell',
      'exec',
      'sftp',
      'scp',
      'port_forward_local',
      'port_forward_remote',
      'agent_forward',
      'x11',
    ];
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/rules'), () => page([rule()])),
      http.post(cp('/v1/rules'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(rule({ name: 'fwd-rule' }), { status: 201 });
      }),
    );
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    await screen.findByText('prod-shell');
    fireEvent.click(screen.getByRole('button', { name: 'New rule…' }));
    for (const capability of allCapabilities) {
      fireEvent.click(screen.getByRole('checkbox', { name: capability }));
    }
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'fwd-rule' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create rule' }));
    await waitFor(() => {
      expect(body?.capabilities).toEqual(allCapabilities);
    });
  });

  it('sends the version on edit', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/rules'), () => page([rule({ version: 5 })])),
      http.put(cp('/v1/rules/:ruleId'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(rule({ version: 6 }));
      }),
    );
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('prod-shell'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() => {
      expect(body?.version).toBe(5);
    });
  });

  it('surfaces a 409 stale-version conflict with a reload hint', async () => {
    server.use(
      http.get(cp('/v1/rules'), () => page([rule({ version: 5 })])),
      http.put(cp('/v1/rules/:ruleId'), () => problem(409, 'Version conflict')),
    );
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('prod-shell'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    expect(await screen.findByText('Version conflict')).toBeInTheDocument();
    expect(
      screen.getByText(/changed since you loaded it/i),
    ).toBeInTheDocument();
  });

  it('deletes a rule after confirmation', async () => {
    let deleted = false;
    server.use(
      http.get(cp('/v1/rules'), () => page([rule()])),
      http.delete(cp('/v1/rules/:ruleId'), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('prod-shell'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });

  it('paginates with Load more', async () => {
    server.use(
      http.get(cp('/v1/rules'), ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return cursor === null
          ? page([rule({ id: 'a', name: 'first-rule' })], 'CURSOR2')
          : page([rule({ id: 'b', name: 'second-rule' })]);
      }),
    );
    renderWithProviders(<RulesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    await screen.findByText('first-rule');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('second-rule')).toBeInTheDocument();
  });
});
