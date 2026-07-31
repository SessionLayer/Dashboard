import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cp, ok, problem } from '../../test/msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import type {
  NodeResource,
  QuarantineNodeRequest,
  RegisterNodeRequest,
} from '../../api/types';
import { NodeList } from './NodeList';

function node(
  over: Partial<NodeResource> & { id: string; name: string },
): NodeResource {
  return {
    connectorKind: 'agentless',
    status: 'active',
    health: 'healthy',
    ...over,
  };
}

const nodes: NodeResource[] = [
  node({
    id: 'n1',
    name: 'web-01',
    address: '10.0.1.11:22',
    labels: { env: 'prod' },
    updatedAt: '2026-07-16T09:59:30Z',
  }),
  node({
    id: 'n2',
    name: 'db-01',
    connectorKind: 'agent',
    status: 'quarantined',
    health: 'unreachable',
  }),
];

const ALL = ['node:enroll', 'node:quarantine', 'node:remove'] as const;

function listNodes(rows: NodeResource[] = nodes) {
  server.use(http.get(cp('/v1/nodes'), () => ok({ nodes: rows })));
}

describe('NodeList', () => {
  it('renders nodes with status, health, and labels', async () => {
    listNodes();
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });

    expect(await screen.findByText('web-01')).toBeInTheDocument();
    expect(screen.getByText('db-01')).toBeInTheDocument();
    expect(screen.getByText('unreachable')).toBeInTheDocument();
    expect(screen.getByText('quarantined')).toBeInTheDocument();
    // label chip key + value
    expect(screen.getByText('env')).toBeInTheDocument();
    expect(screen.getByText('prod')).toBeInTheDocument();
    // "Last seen" is the closest honest proxy for a heartbeat the contract
    // doesn't expose (updatedAt, not a real liveness signal) — exact UTC value
    // lives in the title so the assertion doesn't depend on wall-clock time.
    expect(screen.getByText('Last seen')).toBeInTheDocument();
    expect(screen.getByTitle('2026-07-16T09:59:30.000Z')).toBeInTheDocument();
  });

  it('shows a loading state before the list resolves', () => {
    listNodes();
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
  });

  it('renders an empty state when there are no nodes', async () => {
    listNodes([]);
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });
    expect(await screen.findByText('No nodes enrolled.')).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem on list failure', async () => {
    server.use(
      http.get(cp('/v1/nodes'), () => problem(503, 'Service Unavailable')),
    );
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });
    expect(await screen.findByText('Service Unavailable')).toBeInTheDocument();
  });

  it('renders a 403 as a not-permitted message', async () => {
    server.use(http.get(cp('/v1/nodes'), () => problem(403, 'Forbidden')));
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('opens node detail via getNode', async () => {
    listNodes();
    server.use(
      http.get(cp('/v1/nodes/n1'), () =>
        ok(node({ id: 'n1', name: 'web-01', address: '10.0.1.11:22' })),
      ),
    );
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'web-01' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Node detail')).toBeInTheDocument();
    expect(await within(dialog).findByText('10.0.1.11:22')).toBeInTheDocument();
  });

  it('registers an agentless node and requires a host-identity anchor', async () => {
    listNodes();
    let body: RegisterNodeRequest | undefined;
    server.use(
      http.post(cp('/v1/nodes'), async ({ request }) => {
        body = (await request.json()) as RegisterNodeRequest;
        return ok(node({ id: 'n3', name: 'app-01' }), 201);
      }),
    );
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });

    await screen.findByText('web-01');
    fireEvent.click(screen.getByRole('button', { name: 'Register node…' }));
    const dialog = screen.getByRole('dialog');

    // No host identity yet: submit is blocked and the no-TOFU error shows.
    expect(
      within(dialog).getByRole('button', { name: 'Register' }),
    ).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/^Name/), {
      target: { value: 'app-01' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Dial address/), {
      target: { value: '10.0.3.4:22' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Host certificate/), {
      target: { value: 'ssh-ed25519-cert-v01@openssh.com AAAA...' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(body).toBeDefined();
    });
    expect(body?.name).toBe('app-01');
    expect(body?.address).toBe('10.0.3.4:22');
    expect(body?.hostCertificate).toContain('ssh-ed25519-cert');
    expect(body?.pinnedHostKey).toBeUndefined();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('quarantines an active node with a reason and session policy', async () => {
    listNodes();
    let body: QuarantineNodeRequest | undefined;
    server.use(
      http.post(cp('/v1/nodes/n1/quarantine'), async ({ request }) => {
        body = (await request.json()) as QuarantineNodeRequest;
        return ok(node({ id: 'n1', name: 'web-01', status: 'quarantined' }));
      }),
    );
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });

    await screen.findByText('web-01');
    fireEvent.click(screen.getByRole('button', { name: 'Quarantine' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), {
      target: { value: 'suspected compromise' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Quarantine' }));

    await waitFor(() => {
      expect(body).toBeDefined();
    });
    expect(body?.reason).toBe('suspected compromise');
    expect(body?.existingSessions).toBe('kill');
  });

  it('removes a node behind a confirm dialog', async () => {
    listNodes();
    let removed = false;
    server.use(
      http.delete(cp('/v1/nodes/n1'), () => {
        removed = true;
        return new Response(null, { status: 204 });
      }),
    );
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: [...ALL],
    });

    const row = (await screen.findByText('web-01')).closest('tr');
    fireEvent.click(
      within(row as HTMLElement).getByRole('button', { name: 'Remove' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(removed).toBe(true);
    });
  });

  it('hides mutating actions without the permission (server remains the gate)', async () => {
    listNodes();
    renderWithProviders(<NodeList />, {
      authenticated: true,
      permissions: ['audit:read'],
    });

    await screen.findByText('web-01');
    expect(
      screen.queryByRole('button', { name: 'Register node…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Quarantine' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release' }),
    ).not.toBeInTheDocument();
  });
});
