import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import { cp, page, problem } from '../../test/msw';
import type { RoleBindingResource } from '../../api/types';
import { RoleBindingsScreen } from './RoleBindingsScreen';

const binding = (
  over: Partial<RoleBindingResource> = {},
): RoleBindingResource => ({
  id: '33333333-3333-3333-3333-333333333333',
  roleId: '22222222-2222-2222-2222-222222222222',
  subjectKind: 'group',
  subject: 'platform-admins',
  origin: 'api',
  version: 2,
  ...over,
});

const WRITE = ['rbac:read', 'rbac:write'] as const;

describe('RoleBindingsScreen', () => {
  it('renders a page of bindings', async () => {
    server.use(http.get(cp('/v1/role-bindings'), () => page([binding()])));
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('platform-admins')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    server.use(http.get(cp('/v1/role-bindings'), () => page([])));
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('No role bindings yet')).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem', async () => {
    server.use(http.get(cp('/v1/role-bindings'), () => problem(500, 'Boom')));
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('Boom')).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(http.get(cp('/v1/role-bindings'), () => problem(403, 'no')));
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: ['rbac:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the create action without rbac:write', async () => {
    server.use(http.get(cp('/v1/role-bindings'), () => page([binding()])));
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: ['rbac:read'],
    });
    await screen.findByText('platform-admins');
    expect(
      screen.queryByRole('button', { name: 'New binding…' }),
    ).not.toBeInTheDocument();
  });

  it('creates a binding (role-id fallback when no roles are loaded)', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/role-bindings'), () => page([binding()])),
      http.get(cp('/v1/roles'), () => page([])),
      http.post(cp('/v1/role-bindings'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(binding(), { status: 201 });
      }),
    );
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    await screen.findByText('platform-admins');
    fireEvent.click(screen.getByRole('button', { name: 'New binding…' }));
    fireEvent.change(await screen.findByRole('textbox', { name: 'Role ID' }), {
      target: { value: 'role-uuid-1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject' }), {
      target: { value: 'sre-team' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create binding' }));
    await waitFor(() => {
      expect(body?.roleId).toBe('role-uuid-1');
    });
    expect(body?.subject).toBe('sre-team');
  });

  it('sends the version on edit', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/role-bindings'), () => page([binding({ version: 2 })])),
      http.put(cp('/v1/role-bindings/:bindingId'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(binding({ version: 3 }));
      }),
    );
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('platform-admins'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() => {
      expect(body?.version).toBe(2);
    });
  });

  it('surfaces a 409 stale-version conflict with a reload hint', async () => {
    server.use(
      http.get(cp('/v1/role-bindings'), () => page([binding({ version: 2 })])),
      http.put(cp('/v1/role-bindings/:bindingId'), () =>
        problem(409, 'Version conflict'),
      ),
    );
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('platform-admins'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    expect(await screen.findByText('Version conflict')).toBeInTheDocument();
    expect(
      screen.getByText(/changed since you loaded it/i),
    ).toBeInTheDocument();
  });

  it('deletes a binding after confirmation', async () => {
    let deleted = false;
    server.use(
      http.get(cp('/v1/role-bindings'), () => page([binding()])),
      http.delete(cp('/v1/role-bindings/:bindingId'), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<RoleBindingsScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('platform-admins'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });
});
