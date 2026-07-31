import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { cp, ok, problem } from '../../test/msw';
import { renderWithProviders } from '../../test/utils';
import { JitRequestList } from './JitRequestList';

interface JitReq {
  id: string;
  requester: string;
  targetNodeName?: string;
  principal: string;
  reason: string;
  state: string;
  approvalChain?: { kind: string; value: string }[];
  approvals?: { approver: string; level: number; decision: string }[];
  requestedAt: string;
}

function req(overrides: Partial<JitReq> = {}): JitReq {
  return {
    id: '018f0000-0000-7000-8000-000000000001',
    requester: 'other@corp.example',
    targetNodeName: 'web-01',
    principal: 'deploy',
    reason: 'Ship a hotfix',
    state: 'PENDING_APPROVAL',
    approvalChain: [{ kind: 'email', value: 'lead@corp.example' }],
    approvals: [],
    requestedAt: '2026-07-16T09:00:00Z',
    ...overrides,
  };
}

const APPROVE = ['request:approve'] as const;

describe('JitRequestList', () => {
  it('lists requests with their state badge', async () => {
    server.use(
      http.get(cp('/v1/jit-requests'), () => ok({ jitRequests: [req()] })),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });

    expect(await screen.findByText('other@corp.example')).toBeInTheDocument();
    expect(
      screen.getByText('PENDING_APPROVAL', { selector: '.badge' }),
    ).toBeInTheDocument();
  });

  it('shows a loading state, then an empty state when there are none', async () => {
    server.use(http.get(cp('/v1/jit-requests'), () => ok({ jitRequests: [] })));
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(
      await screen.findByText('No JIT requests match this filter.'),
    ).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 error', async () => {
    server.use(
      http.get(cp('/v1/jit-requests'), () =>
        problem(500, 'Internal Server Error', 'boom'),
      ),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });
    expect(
      await screen.findByText('Internal Server Error'),
    ).toBeInTheDocument();
  });

  it('renders a 403 as a not-permitted message', async () => {
    server.use(
      http.get(cp('/v1/jit-requests'), () => problem(403, 'Forbidden')),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  // ---- no self-approval affordance ----

  it('does NOT offer approve/deny when the current user is the requester', async () => {
    server.use(
      http.get(cp('/v1/jit-requests'), () =>
        ok({ jitRequests: [req({ requester: 'admin@test' })] }),
      ),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });
    expect(await screen.findByText('admin@test')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Deny' }),
    ).not.toBeInTheDocument();
  });

  it('offers approve/deny when the requester is someone else', async () => {
    server.use(
      http.get(cp('/v1/jit-requests'), () =>
        ok({ jitRequests: [req({ requester: 'other@corp.example' })] }),
      ),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });
    expect(await screen.findByText('other@corp.example')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
  });

  it('hides all decision controls without request:approve', async () => {
    server.use(
      http.get(cp('/v1/jit-requests'), () => ok({ jitRequests: [req()] })),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('other@corp.example');
    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Deny' }),
    ).not.toBeInTheDocument();
  });

  it('approves a request and reflects the new state', async () => {
    let state = 'PENDING_APPROVAL';
    server.use(
      http.get(cp('/v1/jit-requests'), () =>
        ok({ jitRequests: [req({ state })] }),
      ),
      http.post(cp('/v1/jit-requests/:id/approve'), () => {
        state = 'APPROVED';
        return ok(req({ state }));
      }),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('APPROVED')).toBeInTheDocument();
  });

  it('denies a request and reflects the new state', async () => {
    let state = 'PENDING_APPROVAL';
    server.use(
      http.get(cp('/v1/jit-requests'), () =>
        ok({ jitRequests: [req({ state })] }),
      ),
      http.post(cp('/v1/jit-requests/:id/deny'), () => {
        state = 'DENIED';
        return ok(req({ state }));
      }),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Deny' }));

    expect(await screen.findByText('DENIED')).toBeInTheDocument();
  });

  it('submits a new request and closes the dialog', async () => {
    server.use(
      http.get(cp('/v1/jit-requests'), () => ok({ jitRequests: [] })),
      http.post(cp('/v1/jit-requests'), () => ok(req(), 201)),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Request access…' }),
    );
    fireEvent.change(
      screen.getByLabelText('Target node id', { exact: false }),
      { target: { value: '018f0000-0000-7000-8000-0000000000ff' } },
    );
    fireEvent.change(
      screen.getByLabelText('Principal (Linux login)', { exact: false }),
      { target: { value: 'deploy' } },
    );
    fireEvent.change(screen.getByLabelText('Reason', { exact: false }), {
      target: { value: 'Ship it' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    await waitFor(() => {
      expect(screen.queryByText('Request JIT access')).not.toBeInTheDocument();
    });
  });

  it('opens a detail dialog fetched via getJitRequest', async () => {
    const detail = req({
      approvalChain: [
        { kind: 'email', value: 'lead@corp.example' },
        { kind: 'oidc_group', value: 'sec' },
      ],
      approvals: [
        { approver: 'lead@corp.example', level: 1, decision: 'approve' },
      ],
    });
    server.use(
      http.get(cp('/v1/jit-requests'), () => ok({ jitRequests: [req()] })),
      http.get(cp('/v1/jit-requests/:id'), () => ok(detail)),
    );
    renderWithProviders(<JitRequestList />, {
      authenticated: true,
      permissions: [...APPROVE],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));
    expect(await screen.findByText('Approval chain')).toBeInTheDocument();
    // L2's line is unique to the fetched detail (getJitRequest), not the row.
    expect(screen.getByText(/oidc_group/)).toBeInTheDocument();
  });
});
