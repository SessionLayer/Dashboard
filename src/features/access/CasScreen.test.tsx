import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import { cp, page, problem } from '../../test/msw';
import type { CaResource } from '../../api/types';
import { CasScreen } from './CasScreen';

const ca = (over: Partial<CaResource> = {}): CaResource => ({
  id: '44444444-4444-4444-4444-444444444444',
  name: 'user-ca',
  caKind: 'user',
  backend: 'aws_kms',
  keyReference: 'arn:aws:kms:key/abc',
  algorithm: 'ecdsa-p256',
  rotationState: 'active',
  origin: 'default',
  version: 7,
  ...over,
});

const MANAGE = ['ca:manage', 'ca:rotate'] as const;

describe('CasScreen', () => {
  it('renders a page of CAs', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([ca()])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(await screen.findByText('user-ca')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(
      await screen.findByText('No certificate authorities yet'),
    ).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem', async () => {
    server.use(http.get(cp('/v1/cas'), () => problem(500, 'CA down')));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(await screen.findByText('CA down')).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(http.get(cp('/v1/cas'), () => problem(403, 'no')));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides create/rotate without their permissions', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([ca()])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('user-ca');
    expect(
      screen.queryByRole('button', { name: 'New CA…' }),
    ).not.toBeInTheDocument();
  });

  // The CaAlgorithm enum is wider than what can be created — it also admits the
  // values a row may already carry — so offering the whole enum would offer a
  // 422. Only the assemblable curves are creatable; a row carrying one of the
  // others is still shown.
  it('offers only the algorithms a CA can actually be created with', async () => {
    server.use(
      http.get(cp('/v1/cas'), () => page([ca({ algorithm: 'ed25519' })])),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(await screen.findByText('ed25519')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New CA…' }));
    const options = Array.from(
      screen
        .getByRole('combobox', { name: /^Algorithm/ })
        .querySelectorAll('option'),
    ).map((o) => o.value);
    expect(options).toEqual(['ecdsa-p256', 'ecdsa-p384', 'ecdsa-p521']);
  });

  // Unlike algorithm, a backend with no signer is NOT dropped from the list —
  // an upgraded deployment may already have a CA row configured with one, and
  // it must stay selectable/displayable. It is annotated instead.
  it('keeps all four backends listed, annotating the two with no signer', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([ca()])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    await screen.findByText('user-ca');
    fireEvent.click(screen.getByRole('button', { name: 'New CA…' }));
    const labels = Array.from(
      screen
        .getByRole('combobox', { name: 'Backend' })
        .querySelectorAll('option'),
    ).map((o) => o.textContent);
    expect(labels).toEqual([
      'local',
      'aws_kms',
      'azure_keyvault',
      'vault — no signer in this build',
    ]);
  });

  it('creates a CA and never offers a private-key field', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/cas'), () => page([ca()])),
      http.post(cp('/v1/cas'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ca({ name: 'host-ca' }), { status: 201 });
      }),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    await screen.findByText('user-ca');
    fireEvent.click(screen.getByRole('button', { name: 'New CA…' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'host-ca' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Key reference' }), {
      target: { value: 'arn:aws:kms:key/xyz' },
    });
    expect(screen.queryByLabelText(/private key/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create CA' }));
    await waitFor(() => {
      expect(body?.name).toBe('host-ca');
    });
    expect(body?.keyReference).toBe('arn:aws:kms:key/xyz');
    expect(body).not.toHaveProperty('privateKey');
  });

  it('sends the version on edit', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/cas'), () =>
        page([ca({ version: 7, rotationState: 'incoming' })]),
      ),
      http.put(cp('/v1/cas/:caId'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ca({ version: 8 }));
      }),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('user-ca'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() => {
      expect(body?.version).toBe(7);
    });
  });

  it('surfaces a 409 stale-version conflict with a reload hint', async () => {
    server.use(
      http.get(cp('/v1/cas'), () =>
        page([ca({ version: 7, rotationState: 'incoming' })]),
      ),
      http.put(cp('/v1/cas/:caId'), () => problem(409, 'Version conflict')),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('user-ca'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save changes' }),
    );

    expect(await screen.findByText('Version conflict')).toBeInTheDocument();
    expect(
      screen.getByText(/changed since you loaded it/i),
    ).toBeInTheDocument();
  });

  // update() 409s on any active CA (its backend/keyReference/algorithm can
  // only change via rotation), so Edit must not offer a write that always fails.
  it('disables Edit for an active CA and explains why', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([ca()])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('user-ca'));
    const editButton = await screen.findByRole('button', { name: 'Edit' });
    expect(editButton).toBeDisabled();
    expect(editButton.title).toMatch(/rotation/i);
  });

  it('keeps Edit available for a non-active CA', async () => {
    server.use(
      http.get(cp('/v1/cas'), () => page([ca({ rotationState: 'outgoing' })])),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('user-ca'));
    const editButton = await screen.findByRole('button', { name: 'Edit' });
    expect(editButton).not.toBeDisabled();
    expect(editButton.title).toBe('');
  });

  it('rotates a CA after confirmation via the inline row action', async () => {
    let rotated = false;
    server.use(
      http.get(cp('/v1/cas'), () => page([ca()])),
      http.post(cp('/v1/cas/:caId/rotate'), () => {
        rotated = true;
        return HttpResponse.json(ca());
      }),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    await screen.findByText('user-ca');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rotate' }));
    await waitFor(() => {
      expect(rotated).toBe(true);
    });
  });

  it('rotates a CA from the detail dialog too', async () => {
    let rotated = false;
    server.use(
      http.get(cp('/v1/cas'), () => page([ca()])),
      http.post(cp('/v1/cas/:caId/rotate'), () => {
        rotated = true;
        return HttpResponse.json(ca());
      }),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('user-ca'));
    const detail = screen.getByRole('dialog');
    fireEvent.click(within(detail).getByRole('button', { name: 'Rotate' }));
    const confirm = screen.getByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Rotate' }));
    await waitFor(() => {
      expect(rotated).toBe(true);
    });
  });

  it('hides the inline Rotate action without ca:rotate', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([ca()])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: ['ca:manage'],
    });
    await screen.findByText('user-ca');
    expect(
      screen.queryByRole('button', { name: 'Rotate' }),
    ).not.toBeInTheDocument();
  });

  it('rotates onto a different backend via the override field', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.get(cp('/v1/cas'), () => page([ca()])),
      http.post(cp('/v1/cas/:caId/rotate'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ca());
      }),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    await screen.findByText('user-ca');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Backend' }),
      { target: { value: 'azure_keyvault' } },
    );
    fireEvent.change(
      within(dialog).getByRole('textbox', {
        name: 'Incoming key reference',
      }),
      {
        target: {
          value:
            'https://example.vault.azure.net/keys/session-ca/abcd1234abcd1234abcd1234abcd1234',
        },
      },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rotate' }));
    await waitFor(() => {
      expect(body?.backend).toBe('azure_keyvault');
    });
    expect(body?.keyReference).toBe(
      'https://example.vault.azure.net/keys/session-ca/abcd1234abcd1234abcd1234abcd1234',
    );
  });

  it('blocks rotating onto azure_keyvault without a versioned key reference', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([ca()])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    await screen.findByText('user-ca');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Backend' }),
      { target: { value: 'azure_keyvault' } },
    );
    const rotateButton = within(dialog).getByRole('button', {
      name: 'Rotate',
    });
    expect(rotateButton).toBeDisabled();

    fireEvent.change(
      within(dialog).getByRole('textbox', {
        name: 'Incoming key reference',
      }),
      { target: { value: 'not-a-key-vault-reference' } },
    );
    expect(rotateButton).toBeDisabled();
    expect(
      within(dialog).getByText(/versioned Key Vault key identifier/),
    ).toBeInTheDocument();
  });

  it('rotates onto aws_kms with a key ARN', async () => {
    let body: Record<string, unknown> | undefined;
    const arn = 'arn:aws:kms:us-east-1:123456789012:key/'
      + '5831a034-6a75-444e-8fd4-f1b57f27b4b9';
    server.use(
      http.get(cp('/v1/cas'), () => page([ca()])),
      http.post(cp('/v1/cas/:caId/rotate'), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ca());
      }),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    await screen.findByText('user-ca');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Backend' }),
      { target: { value: 'aws_kms' } },
    );
    fireEvent.change(
      within(dialog).getByRole('textbox', {
        name: 'Incoming key reference',
      }),
      { target: { value: arn } },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rotate' }));
    await waitFor(() => {
      expect(body?.backend).toBe('aws_kms');
    });
    expect(body?.keyReference).toBe(arn);
  });

  it('refuses a KMS alias ARN by name, not as a generic shape error', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([ca()])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    await screen.findByText('user-ca');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('combobox', { name: 'Backend' }),
      { target: { value: 'aws_kms' } },
    );
    const rotateButton = within(dialog).getByRole('button', {
      name: 'Rotate',
    });
    expect(rotateButton).toBeDisabled();

    fireEvent.change(
      within(dialog).getByRole('textbox', {
        name: 'Incoming key reference',
      }),
      {
        target: {
          value: 'arn:aws:kms:us-east-1:123456789012:alias/session-ca',
        },
      },
    );
    expect(rotateButton).toBeDisabled();
    expect(
      within(dialog).getByText(/alias ARN is refused/),
    ).toBeInTheDocument();
  });

  it('deletes a CA after confirmation', async () => {
    let deleted = false;
    server.use(
      http.get(cp('/v1/cas'), () => page([ca()])),
      http.delete(cp('/v1/cas/:caId'), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    fireEvent.click(await screen.findByText('user-ca'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
  });
});
