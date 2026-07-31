import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../../test/server';
import { cp, ok, problem } from '../../test/msw';
import { renderWithProviders } from '../../test/utils';
import { BreakGlassScreen } from './BreakGlassScreen';

const MANAGE = ['breakglass:manage'] as const;

function activation(overrides: Record<string, unknown> = {}) {
  return {
    id: '018f0000-0000-7000-8000-0000000000b1',
    identity: 'oncall@corp.example',
    principal: 'root',
    reason: 'Pager: DB down',
    alertRef: 'PD-4821',
    reviewStatus: 'pending',
    activatedAt: '2026-07-16T07:30:00Z',
    ...overrides,
  };
}

describe('BreakGlassScreen — activations', () => {
  it('lists activations with a review-status badge', async () => {
    server.use(
      http.get(cp('/v1/breakglass/activations'), () =>
        ok({ activations: [activation()] }),
      ),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(await screen.findByText('Pager: DB down')).toBeInTheDocument();
    expect(
      screen.getByText('pending', { selector: '.badge' }),
    ).toBeInTheDocument();
  });

  it('records a review and reflects the reviewed status', async () => {
    let status = 'pending';
    server.use(
      http.get(cp('/v1/breakglass/activations'), () =>
        ok({ activations: [activation({ reviewStatus: status })] }),
      ),
      http.post(cp('/v1/breakglass/activations/:id/review'), () => {
        status = 'reviewed';
        return ok(activation({ reviewStatus: status }));
      }),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Record review' }),
    );

    expect(
      await screen.findByText('reviewed', { selector: '.badge' }),
    ).toBeInTheDocument();
  });

  it('renders a 403 gracefully', async () => {
    server.use(
      http.get(cp('/v1/breakglass/activations'), () =>
        problem(403, 'Forbidden'),
      ),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides the review control without breakglass:manage', async () => {
    server.use(
      http.get(cp('/v1/breakglass/activations'), () =>
        ok({ activations: [activation()] }),
      ),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('Pager: DB down');
    expect(
      screen.queryByRole('button', { name: 'Review' }),
    ).not.toBeInTheDocument();
  });
});

describe('BreakGlassScreen — tab a11y', () => {
  it('follows the WAI-ARIA tabs contract with arrow-key navigation', async () => {
    server.use(
      http.get(cp('/v1/breakglass/activations'), () => ok({ activations: [] })),
      http.get(cp('/v1/breakglass/credentials'), () => ok({ credentials: [] })),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });

    const tablist = screen.getByRole('tablist', {
      name: 'Break-glass sections',
    });
    const activations = screen.getByRole('tab', { name: 'Activations' });
    const credentials = screen.getByRole('tab', { name: 'FIDO2 credentials' });

    // Roving tabindex: only the active tab is in the tab order.
    expect(activations).toHaveAttribute('aria-selected', 'true');
    expect(activations).toHaveAttribute('tabindex', '0');
    expect(credentials).toHaveAttribute('tabindex', '-1');

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', activations.id);
    expect(activations).toHaveAttribute('aria-controls', panel.id);

    fireEvent.keyDown(tablist, { key: 'ArrowRight' });

    expect(credentials).toHaveAttribute('aria-selected', 'true');
    expect(credentials).toHaveAttribute('tabindex', '0');
    expect(activations).toHaveAttribute('tabindex', '-1');
    expect(panel).toHaveAttribute('aria-labelledby', credentials.id);
    expect(
      await screen.findByText('No break-glass credentials registered.'),
    ).toBeInTheDocument();

    // Home returns to the first tab.
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(activations).toHaveAttribute('aria-selected', 'true');
  });
});

describe('BreakGlassScreen — credentials', () => {
  it('registers a credential, then revokes it', async () => {
    let creds: Record<string, unknown>[] = [];
    const created = {
      id: '018f0000-0000-7000-8000-0000000000b2',
      keyFingerprint: 'SHA256:credkey',
      identity: 'oncall@corp.example',
      allowedPrincipals: ['root'],
      createdAt: '2026-07-16T10:00:00Z',
    };
    server.use(
      http.get(cp('/v1/breakglass/activations'), () => ok({ activations: [] })),
      http.get(cp('/v1/breakglass/credentials'), () =>
        ok({ credentials: creds }),
      ),
      http.post(cp('/v1/breakglass/credentials'), () => {
        creds = [created];
        return ok(created, 201);
      }),
      http.delete(cp('/v1/breakglass/credentials/:id'), () => {
        creds = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });

    fireEvent.click(screen.getByRole('tab', { name: 'FIDO2 credentials' }));
    expect(
      await screen.findByText('No break-glass credentials registered.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Register key…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText('Public key', { exact: false }),
      { target: { value: 'AAAAsk-ecdsa-blob' } },
    );
    fireEvent.change(
      within(dialog).getByLabelText('Identity', { exact: false }),
      { target: { value: 'oncall@corp.example' } },
    );
    const principals = within(dialog).getByLabelText('Allowed principals', {
      exact: false,
    });
    fireEvent.change(principals, { target: { value: 'root' } });
    fireEvent.keyDown(principals, { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('SHA256:credkey')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    const confirm = screen.getByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(
        screen.getByText('No break-glass credentials registered.'),
      ).toBeInTheDocument();
    });
  });

  it('hides register/revoke without breakglass:manage', async () => {
    server.use(
      http.get(cp('/v1/breakglass/activations'), () => ok({ activations: [] })),
      http.get(cp('/v1/breakglass/credentials'), () =>
        ok({
          credentials: [
            {
              id: '018f0000-0000-7000-8000-0000000000b2',
              keyFingerprint: 'SHA256:credkey',
              identity: 'oncall@corp.example',
              allowedPrincipals: ['root'],
              createdAt: '2026-07-16T10:00:00Z',
            },
          ],
        }),
      ),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    fireEvent.click(screen.getByRole('tab', { name: 'FIDO2 credentials' }));
    await screen.findByText('SHA256:credkey');
    expect(
      screen.queryByRole('button', { name: 'Register key…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke' }),
    ).not.toBeInTheDocument();
  });
});

describe('BreakGlassScreen — offline codes', () => {
  it('issues codes and reveals them exactly once', async () => {
    server.use(
      http.get(cp('/v1/breakglass/activations'), () => ok({ activations: [] })),
      http.get(cp('/v1/breakglass/offline-codes'), () =>
        ok({ offlineCodes: [] }),
      ),
      http.post(cp('/v1/breakglass/offline-codes'), () =>
        ok(
          {
            ids: ['018f0000-0000-7000-8000-0000000000c1'],
            codes: ['DEMO-CODE-0001', 'DEMO-CODE-0002'],
            expiresAt: '2026-10-14T00:00:00Z',
          },
          201,
        ),
      ),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: [...MANAGE],
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Offline code batches' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Issue codes…' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText('Identity', { exact: false }),
      { target: { value: 'oncall@corp.example' } },
    );
    const principals = within(dialog).getByLabelText('Allowed principals', {
      exact: false,
    });
    fireEvent.change(principals, { target: { value: 'root' } });
    fireEvent.keyDown(principals, { key: 'Enter' });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Issue codes' }),
    );

    expect(await screen.findByText('DEMO-CODE-0001')).toBeInTheDocument();
    expect(screen.getByText('DEMO-CODE-0002')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('hides the issue control without breakglass:manage', async () => {
    server.use(
      http.get(cp('/v1/breakglass/activations'), () => ok({ activations: [] })),
      http.get(cp('/v1/breakglass/offline-codes'), () =>
        ok({ offlineCodes: [] }),
      ),
    );
    renderWithProviders(<BreakGlassScreen />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Offline code batches' }));
    expect(
      await screen.findByText('No offline codes issued.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Issue codes…' }),
    ).not.toBeInTheDocument();
  });
});
