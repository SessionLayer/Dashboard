import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import { cp, page, problem } from '../../test/msw';
import type { RoleResource } from '../../api/types';
import { RolesScreen } from './RolesScreen';

const role = (over: Partial<RoleResource> = {}): RoleResource => ({
  id: '22222222-2222-2222-2222-222222222222',
  name: 'platform-admin',
  permissions: ['rbac:read', 'rbac:write'],
  description: 'Admins',
  origin: 'default',
  version: 3,
  ...over,
});

const WRITE = ['rbac:read', 'rbac:write'] as const;

describe('RolesScreen', () => {
  it('renders a page of roles', async () => {
    server.use(http.get(cp('/v1/roles'), () => page([role()])));
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('platform-admin')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    server.use(http.get(cp('/v1/roles'), () => page([])));
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('No roles yet')).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem', async () => {
    server.use(http.get(cp('/v1/roles'), () => problem(503, 'Unavailable')));
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(http.get(cp('/v1/roles'), () => problem(403, 'nope')));
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: ['rbac:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the create action without rbac:write', async () => {
    server.use(http.get(cp('/v1/roles'), () => page([role()])));
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: ['rbac:read'],
    });
    await screen.findByText('platform-admin');
    expect(
      screen.queryByRole('button', { name: 'New role…' }),
    ).not.toBeInTheDocument();
  });

  it('creates a role with selected permissions', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/roles'), () => page([role()])),
      http.post(cp('/v1/roles'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(role({ name: 'auditor' }), { status: 201 });
      }),
    );
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    await screen.findByText('platform-admin');
    fireEvent.click(screen.getByRole('button', { name: 'New role…' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'auditor' },
    });
    fireEvent.click(screen.getByLabelText('audit:read'));
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }));
    await waitFor(() => {
      expect(body?.name).toBe('auditor');
    });
    expect(body?.permissions).toContain('audit:read');
  });

  it('sends the version on edit', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/roles'), () => page([role({ version: 3 })])),
      http.put(cp('/v1/roles/:roleId'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(role({ version: 4 }));
      }),
    );
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('platform-admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() => {
      expect(body?.version).toBe(3);
    });
  });

  it('surfaces a 409 stale-version conflict with a reload hint', async () => {
    server.use(
      http.get(cp('/v1/roles'), () => page([role({ version: 3 })])),
      http.put(cp('/v1/roles/:roleId'), () => problem(409, 'Version conflict')),
    );
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('platform-admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    expect(await screen.findByText('Version conflict')).toBeInTheDocument();
    expect(
      screen.getByText(/changed since you loaded it/i),
    ).toBeInTheDocument();
  });

  it('deletes a role after confirmation', async () => {
    let deleted = false;
    server.use(
      http.get(cp('/v1/roles'), () => page([role()])),
      http.delete(cp('/v1/roles/:roleId'), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    fireEvent.click(await screen.findByText('platform-admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });

  it('paginates with Load more', async () => {
    server.use(
      http.get(cp('/v1/roles'), ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return cursor === null
          ? page([role({ id: 'a', name: 'role-one' })], 'C2')
          : page([role({ id: 'b', name: 'role-two' })]);
      }),
    );
    renderWithProviders(<RolesScreen />, {
      authenticated: true,
      permissions: [...WRITE],
    });
    await screen.findByText('role-one');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('role-two')).toBeInTheDocument();
  });
});
