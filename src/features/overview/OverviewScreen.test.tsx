import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { http, type HttpResponseResolver } from 'msw';
import { describe, expect, it } from 'vitest';

import { AuthProvider } from '../../auth/AuthContext';
import type { PlatformPermission } from '../../api/types';
import { cp, ok, page, problem } from '../../test/msw';
import { server } from '../../test/server';
import {
  renderWithProviders,
  seedAuth,
  testOidcConfig,
} from '../../test/utils';
import { OverviewScreen } from './OverviewScreen';

function renderOverviewWithRouter(
  options: { authenticated?: boolean; permissions?: PlatformPermission[] } = {},
): void {
  if (options.authenticated === true) {
    seedAuth(options.permissions ?? []);
  }
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: OverviewScreen,
  });
  const marker = (path: string) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <div>{`ROUTE:${path}`}</div>,
    });
  const routeTree = rootRoute.addChildren([
    indexRoute,
    marker('/sessions'),
    marker('/jit-requests'),
    marker('/locks'),
    marker('/break-glass'),
    marker('/nodes'),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider config={testOidcConfig} redirect={() => undefined}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const PERMS = ['rbac:read', 'audit:read'] as const;

interface Overrides {
  sessions?: HttpResponseResolver;
  jit?: HttpResponseResolver;
  locks?: HttpResponseResolver;
  bg?: HttpResponseResolver;
  nodes?: HttpResponseResolver;
  audit?: HttpResponseResolver;
}

function mockOverview(o: Overrides = {}): void {
  server.use(
    http.get(cp('/v1/sessions'), o.sessions ?? (() => page([]))),
    http.get(cp('/v1/jit-requests'), o.jit ?? (() => ok({ jitRequests: [] }))),
    http.get(cp('/v1/locks'), o.locks ?? (() => ok({ locks: [] }))),
    http.get(
      cp('/v1/breakglass/activations'),
      o.bg ?? (() => ok({ activations: [] })),
    ),
    http.get(cp('/v1/nodes'), o.nodes ?? (() => ok({ nodes: [] }))),
    http.get(cp('/v1/audit-events'), o.audit ?? (() => page([]))),
  );
}

const SESSIONS = [
  {
    id: 's1',
    identity: 'alice@corp.example',
    nodeName: 'web-01',
    principal: 'deploy',
    accessModel: 'standing',
    capabilities: ['shell'],
    startedAt: '2026-07-16T09:41:00Z',
  },
  {
    id: 's2',
    identity: 'bob@corp.example',
    nodeName: 'db-02',
    principal: 'postgres',
    accessModel: 'jit',
    capabilities: ['shell'],
    startedAt: '2026-07-16T10:12:00Z',
  },
];

const JIT = [
  {
    id: 'j1',
    requester: 'carol@corp.example',
    targetNodeName: 'db-02',
    principal: 'postgres',
    reason: 'INC-4821',
    state: 'PENDING_APPROVAL',
    requestedAt: '2026-07-16T10:05:00Z',
    approvalDeadline: '2026-07-16T10:35:00Z',
  },
];

const LOCKS = [
  {
    id: 'l1',
    target: { identities: ['mallory@corp.example'] },
    reason: 'Suspected compromise',
    createdAt: '2026-07-16T08:50:00Z',
  },
];

const BREAKGLASS = [
  {
    id: 'b1',
    identity: 'oncall@corp.example',
    principal: 'root',
    reason: 'IdP outage',
    reviewStatus: 'pending',
    activatedAt: '2026-07-16T07:20:00Z',
  },
  {
    id: 'b2',
    identity: 'dev@corp.example',
    principal: 'root',
    reason: 'earlier',
    reviewStatus: 'reviewed',
    activatedAt: '2026-07-15T07:20:00Z',
  },
];

const NODES_MIXED = [
  {
    id: 'n1',
    name: 'web-01',
    connectorKind: 'agent',
    status: 'active',
    health: 'healthy',
  },
  {
    id: 'n2',
    name: 'db-02',
    connectorKind: 'agentless',
    status: 'active',
    health: 'healthy',
  },
  {
    id: 'n3',
    name: 'app-03',
    connectorKind: 'agent',
    status: 'active',
    health: 'unhealthy',
  },
  {
    id: 'n4',
    name: 'cache-04',
    connectorKind: 'agent',
    status: 'quarantined',
    health: 'unreachable',
  },
];

const AUDIT = [
  {
    id: 'a1',
    occurredAt: '2026-07-16T10:12:00Z',
    actor: 'bob@corp.example',
    action: 'session.connect',
    outcome: 'allowed',
    subject: 'db-02',
  },
];

function kpiValue(label: string): string {
  const region = screen.getByRole('region', { name: 'Key metrics' });
  const card = within(region).getByText(label).closest('.metric-card');
  return card?.querySelector('.metric-value')?.textContent ?? '';
}

describe('OverviewScreen', () => {
  it('renders KPIs and recent items aggregated from the API', async () => {
    mockOverview({
      sessions: () => page(SESSIONS),
      jit: () => ok({ jitRequests: JIT }),
      locks: () => ok({ locks: LOCKS }),
      bg: () => ok({ activations: BREAKGLASS }),
      nodes: () => ok({ nodes: NODES_MIXED }),
      audit: () => page(AUDIT),
    });
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS],
    });

    expect(
      await within(
        screen.getByRole('region', { name: 'Active sessions' }),
      ).findByText('alice@corp.example'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'Pending JIT approvals' }),
      ).getByText('carol@corp.example'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'Recent audit events' }),
      ).getByText('session.connect'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(kpiValue('Active sessions')).toBe('2');
    });
    expect(kpiValue('Pending JIT approvals')).toBe('1');
    expect(kpiValue('Active locks')).toBe('1');
    expect(kpiValue('Break-glass to review')).toBe('1'); // only the pending one
    expect(kpiValue('Nodes')).toBe('4');
    expect(kpiValue('Nodes needing attention')).toBe('2'); // unhealthy + unreachable
  });

  it('renders a per-section loading state while reads are in flight', () => {
    const hang: HttpResponseResolver = () =>
      new Promise<Response>(() => undefined);
    mockOverview({
      sessions: hang,
      jit: hang,
      locks: hang,
      bg: hang,
      nodes: hang,
      audit: hang,
    });
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS],
    });

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole('region', { name: 'Key metrics' })).getAllByText(
        '—',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('renders empty states when every section is empty', async () => {
    mockOverview();
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS],
    });

    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
    expect(
      screen.getByText('No requests awaiting approval'),
    ).toBeInTheDocument();
    expect(screen.getByText('No active locks')).toBeInTheDocument();
    expect(screen.getByText('No break-glass activations')).toBeInTheDocument();
    expect(screen.getByText('No nodes registered')).toBeInTheDocument();
    expect(screen.getByText('No audit events')).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem as an alert for the failing section', async () => {
    mockOverview({
      audit: () =>
        problem(500, 'Search failed', 'Downstream store unavailable'),
    });
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS],
    });

    const region = screen.getByRole('region', { name: 'Recent audit events' });
    expect(await within(region).findByRole('alert')).toBeInTheDocument();
    expect(within(region).getByText('Search failed')).toBeInTheDocument();
    expect(screen.getByText('No active sessions')).toBeInTheDocument();
  });

  it('renders a 403 gracefully as "Not permitted"', async () => {
    mockOverview({ nodes: () => problem(403, 'Forbidden') });
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });

    const region = screen.getByRole('region', { name: 'Node health' });
    expect(
      await within(region).findByText('Not permitted'),
    ).toBeInTheDocument();
    expect(kpiValue('Nodes')).toContain('—');
    expect(screen.getAllByText(/unavailable/).length).toBeGreaterThan(0);
  });

  it('summarizes node health with an accessible bar and text legend', async () => {
    mockOverview({ nodes: () => ok({ nodes: NODES_MIXED }) });
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS],
    });

    const bar = await screen.findByRole('img', {
      name: /Node health across 4 nodes/,
    });
    expect(bar).toHaveAccessibleName(
      'Node health across 4 nodes: 2 healthy, 1 unhealthy, 1 unreachable',
    );

    const region = screen.getByRole('region', { name: 'Node health' });
    expect(within(region).getByText('Healthy')).toBeInTheDocument();
    expect(within(region).getByText('Unreachable')).toBeInTheDocument();
    expect(within(region).getByText('1 quarantined')).toBeInTheDocument();
  });

  it('shows Control Plane health and version', async () => {
    mockOverview();
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS],
    });

    const region = await screen.findByRole('region', { name: 'Control Plane' });
    expect(
      await within(region).findByText('SessionLayer Control Plane'),
    ).toBeInTheDocument();
    expect(within(region).getByText('0.1.0')).toBeInTheDocument();
    expect(await within(region).findByText('Healthy')).toBeInTheDocument();
  });

  it('navigates to the backing screen when a KPI tile is activated', async () => {
    mockOverview({
      sessions: () => page(SESSIONS),
    });
    renderOverviewWithRouter({ authenticated: true, permissions: [...PERMS] });

    const region = await screen.findByRole('region', { name: 'Key metrics' });
    const tile = await within(region).findByRole('button', {
      name: /Active sessions/,
    });
    fireEvent.click(tile);

    expect(await screen.findByText('ROUTE:/sessions')).toBeInTheDocument();
  });

  it('shows no alert banners when nothing needs attention', async () => {
    mockOverview();
    renderOverviewWithRouter({ authenticated: true, permissions: [...PERMS] });

    await screen.findByText('No active sessions');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a fail banner for unreviewed break-glass activations and navigates on Review', async () => {
    mockOverview({ bg: () => ok({ activations: BREAKGLASS }) });
    renderOverviewWithRouter({ authenticated: true, permissions: [...PERMS] });

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(
      '1 break-glass activation awaiting mandatory review',
    );
    fireEvent.click(within(banner).getByRole('button', { name: 'Review' }));

    expect(await screen.findByText('ROUTE:/break-glass')).toBeInTheDocument();
  });

  it('shows a warn banner for quarantined nodes and navigates on Inspect', async () => {
    mockOverview({ nodes: () => ok({ nodes: NODES_MIXED }) });
    renderOverviewWithRouter({ authenticated: true, permissions: [...PERMS] });

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('1 node quarantined');
    fireEvent.click(within(banner).getByRole('button', { name: 'Inspect' }));

    expect(await screen.findByText('ROUTE:/nodes')).toBeInTheDocument();
  });

  it('offers inline Approve/Deny on a pending JIT request for an approver', async () => {
    mockOverview({ jit: () => ok({ jitRequests: JIT }) });
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS, 'request:approve'],
    });

    const region = await screen.findByRole('region', {
      name: 'Pending JIT approvals',
    });
    expect(
      await within(region).findByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole('button', { name: 'Deny' }),
    ).toBeInTheDocument();
  });

  it('hides Approve/Deny for a request the signed-in identity submitted (self-approval is impossible)', async () => {
    mockOverview({
      jit: () => ok({ jitRequests: [{ ...JIT[0], requester: 'admin@test' }] }),
    });
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS, 'request:approve'],
    });

    const region = await screen.findByRole('region', {
      name: 'Pending JIT approvals',
    });
    await within(region).findByText('admin@test'); // the row rendered before asserting absence
    expect(
      within(region).queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
  });

  it('hides Approve/Deny entirely without request:approve', async () => {
    mockOverview({ jit: () => ok({ jitRequests: JIT }) });
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS],
    });

    const region = await screen.findByRole('region', {
      name: 'Pending JIT approvals',
    });
    await within(region).findByText('carol@corp.example');
    expect(
      within(region).queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
  });

  it('approves a pending JIT request inline and closes the dialog on success', async () => {
    let approved = false;
    mockOverview({ jit: () => ok({ jitRequests: JIT }) });
    server.use(
      http.post(cp('/v1/jit-requests/:id/approve'), () => {
        approved = true;
        return ok({});
      }),
    );
    renderWithProviders(<OverviewScreen />, {
      authenticated: true,
      permissions: [...PERMS, 'request:approve'],
    });

    const region = await screen.findByRole('region', {
      name: 'Pending JIT approvals',
    });
    fireEvent.click(
      await within(region).findByRole('button', { name: 'Approve' }),
    );

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(approved).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
