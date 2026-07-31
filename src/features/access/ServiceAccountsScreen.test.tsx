import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import { cp, page, problem } from '../../test/msw';
import type { ServiceAccountResource } from '../../api/types';
import { ServiceAccountsScreen } from './ServiceAccountsScreen';

const sa = (
  over: Partial<ServiceAccountResource> = {},
): ServiceAccountResource => ({
  id: '55555555-5555-5555-5555-555555555555',
  name: 'ci-deployer',
  description: 'CI consumer',
  authMethod: 'private_key_jwt',
  keyReference: 'https://ci/jwks.json',
  tokenTtlSeconds: 900,
  origin: 'api',
  version: 4,
  ...over,
});

const MANAGE = ['user:manage'] as const;

describe('ServiceAccountsScreen', () => {
  it('renders a page of service accounts', async () => {
    server.use(http.get(cp('/v1/service-accounts'), () => page([sa()])));
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(await screen.findByText('ci-deployer')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    server.use(http.get(cp('/v1/service-accounts'), () => page([])));
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(
      await screen.findByText('No service accounts yet'),
    ).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem', async () => {
    server.use(
      http.get(cp('/v1/service-accounts'), () => problem(500, 'SA fail')),
    );
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(await screen.findByText('SA fail')).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(http.get(cp('/v1/service-accounts'), () => problem(403, 'no')));
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the create action without user:manage', async () => {
    server.use(http.get(cp('/v1/service-accounts'), () => page([sa()])));
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('ci-deployer');
    expect(
      screen.queryByRole('button', { name: 'New service account…' }),
    ).not.toBeInTheDocument();
  });

  it('creates a service account', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/service-accounts'), () => page([sa()])),
      http.post(cp('/v1/service-accounts'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(sa({ name: 'backup-bot' }), { status: 201 });
      }),
    );
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    await screen.findByText('ci-deployer');
    fireEvent.click(
      screen.getByRole('button', { name: 'New service account…' }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'backup-bot' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create service account' }),
    );
    await waitFor(() => {
      expect(body?.name).toBe('backup-bot');
    });
  });

  it('sends the version on edit', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/service-accounts'), () => page([sa({ version: 4 })])),
      http.put(
        cp('/v1/service-accounts/:serviceAccountId'),
        async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(sa({ version: 5 }));
        },
      ),
    );
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('ci-deployer'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() => {
      expect(body?.version).toBe(4);
    });
  });

  it('surfaces a 409 stale-version conflict with a reload hint', async () => {
    server.use(
      http.get(cp('/v1/service-accounts'), () => page([sa({ version: 4 })])),
      http.put(cp('/v1/service-accounts/:serviceAccountId'), () =>
        problem(409, 'Version conflict'),
      ),
    );
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('ci-deployer'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    expect(await screen.findByText('Version conflict')).toBeInTheDocument();
    expect(
      screen.getByText(/changed since you loaded it/i),
    ).toBeInTheDocument();
  });

  it('issues a credential and reveals the one-time secret', async () => {
    server.use(
      http.get(cp('/v1/service-accounts'), () => page([sa()])),
      http.post(cp('/v1/service-accounts/:serviceAccountId/credentials'), () =>
        HttpResponse.json(
          {
            id: '66666666-6666-6666-6666-666666666666',
            serviceAccountId: sa().id,
            credentialType: 'client_secret',
            clientSecret: 'super-secret-once',
            status: 'active',
            issuedAt: '2026-01-01T00:00:00Z',
          },
          { status: 201 },
        ),
      ),
    );
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('ci-deployer'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Issue credential' }),
    );
    expect(await screen.findByText('super-secret-once')).toBeInTheDocument();
  });

  it('revokes a credential by id behind a confirm dialog', async () => {
    let revoked = false;
    server.use(
      http.get(cp('/v1/service-accounts'), () => page([sa()])),
      http.delete(
        cp('/v1/service-accounts/:serviceAccountId/credentials/:credentialId'),
        () => {
          revoked = true;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('ci-deployer'));
    fireEvent.change(await screen.findByLabelText('Revoke credential by ID'), {
      target: { value: 'cred-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    // Revoke is irreversible (denies new sessions immediately) — it must not
    // fire until the operator confirms in the dialog.
    const dialog = await screen.findByRole('dialog', {
      name: 'Revoke this credential?',
    });
    expect(revoked).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revoked).toBe(true);
    });
  });

  it('cancelling the revoke confirm dialog does not revoke the credential', async () => {
    let revoked = false;
    server.use(
      http.get(cp('/v1/service-accounts'), () => page([sa()])),
      http.delete(
        cp('/v1/service-accounts/:serviceAccountId/credentials/:credentialId'),
        () => {
          revoked = true;
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    renderWithProviders(<ServiceAccountsScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('ci-deployer'));
    fireEvent.change(await screen.findByLabelText('Revoke credential by ID'), {
      target: { value: 'cred-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Revoke this credential?',
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(
      screen.queryByRole('dialog', { name: 'Revoke this credential?' }),
    ).not.toBeInTheDocument();
    expect(revoked).toBe(false);
  });
});
