import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cp, ok, problem } from '../../test/msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import type {
  GatewayEnrollmentTokenResource,
  IssuedGatewayEnrollmentToken,
  MtlsTrustAnchor,
} from '../../api/types';
import { GatewayEnrollmentTokenList } from './GatewayEnrollmentTokenList';

const RAW_TOKEN = 'sl-gwenroll-secret-xyz789';

const tokens: GatewayEnrollmentTokenResource[] = [
  {
    id: 'g1',
    gatewayName: 'gw-eu-1',
    singleUse: true,
    expiresAt: '2026-07-16T12:00:00Z',
    createdAt: '2026-07-16T11:00:00Z',
    createdBy: 'admin@test',
  },
];

const trustAnchor: MtlsTrustAnchor = {
  pem: '-----BEGIN CERTIFICATE-----\nMIIBtestanchor\n-----END CERTIFICATE-----\n',
  fingerprintSha256:
    'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
  subject: 'CN=SessionLayer Internal mTLS CA,O=SessionLayer',
  notBefore: '2026-01-01T00:00:00Z',
  notAfter: '2027-01-01T00:00:00Z',
};

function listTokens(rows: GatewayEnrollmentTokenResource[] = tokens) {
  server.use(
    http.get(cp('/v1/gateway-enrollment-tokens'), () =>
      ok({ gatewayEnrollmentTokens: rows }),
    ),
  );
}

function anchor(value: MtlsTrustAnchor = trustAnchor) {
  server.use(http.get(cp('/v1/cas/mtls/trust-anchor'), () => ok(value)));
}

describe('GatewayEnrollmentTokenList', () => {
  it('lists enrollment tokens with gateway, single-use, and expiry', async () => {
    listTokens();
    anchor();
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });

    expect(await screen.findByText('gw-eu-1')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('admin@test')).toBeInTheDocument();
  });

  it('issues a token and reveals the one-time secret', async () => {
    listTokens();
    anchor();
    let body: { gatewayName: string } | undefined;
    server.use(
      http.post(cp('/v1/gateway-enrollment-tokens'), async ({ request }) => {
        body = (await request.json()) as { gatewayName: string };
        const issued: IssuedGatewayEnrollmentToken = {
          id: 'g2',
          token: RAW_TOKEN,
          gatewayName: body.gatewayName,
          singleUse: true,
          expiresAt: '2026-07-16T12:30:00Z',
        };
        return ok(issued, 201);
      }),
    );
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });

    await screen.findByText('gw-eu-1');
    fireEvent.click(screen.getByRole('button', { name: 'Issue token…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Gateway name/), {
      target: { value: 'gw-us-2' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Issue token' }),
    );

    expect(await screen.findByText(RAW_TOKEN)).toBeInTheDocument();
    expect(screen.getByText(/cannot be retrieved again/)).toBeInTheDocument();
    expect(body?.gatewayName).toBe('gw-us-2');
  });

  // The raw token is returned exactly once, so it must not survive the dialog
  // that revealed it — the list operation never carries it back.
  it('never renders the raw token outside the issuance dialog', async () => {
    const issuedRow: GatewayEnrollmentTokenResource = {
      id: 'g2',
      gatewayName: 'gw-us-2',
      singleUse: true,
      expiresAt: '2026-07-16T12:30:00Z',
      createdAt: '2026-07-16T11:30:00Z',
      createdBy: 'admin@test',
    };
    let issuedOnce = false;
    server.use(
      http.get(cp('/v1/gateway-enrollment-tokens'), () =>
        ok({
          gatewayEnrollmentTokens: issuedOnce ? [...tokens, issuedRow] : tokens,
        }),
      ),
      http.post(cp('/v1/gateway-enrollment-tokens'), () => {
        issuedOnce = true;
        const issued: IssuedGatewayEnrollmentToken = {
          id: 'g2',
          token: RAW_TOKEN,
          gatewayName: 'gw-us-2',
          singleUse: true,
          expiresAt: '2026-07-16T12:30:00Z',
        };
        return ok(issued, 201);
      }),
    );
    anchor();
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });

    await screen.findByText('gw-eu-1');
    fireEvent.click(screen.getByRole('button', { name: 'Issue token…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Gateway name/), {
      target: { value: 'gw-us-2' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Issue token' }),
    );
    await screen.findByText(RAW_TOKEN);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    // The refetched list now contains the newly issued token's row…
    expect(await screen.findByText('gw-us-2')).toBeInTheDocument();
    // …but the secret itself is gone from the document, and never came back
    // over the list operation.
    await waitFor(() => {
      expect(screen.queryByText(RAW_TOKEN)).not.toBeInTheDocument();
    });
    expect(document.body.textContent).not.toContain(RAW_TOKEN);
  });

  it('does not persist the raw token to web storage', async () => {
    listTokens();
    anchor();
    server.use(
      http.post(cp('/v1/gateway-enrollment-tokens'), () => {
        const issued: IssuedGatewayEnrollmentToken = {
          id: 'g2',
          token: RAW_TOKEN,
          gatewayName: 'gw-us-2',
          singleUse: true,
          expiresAt: '2026-07-16T12:30:00Z',
        };
        return ok(issued, 201);
      }),
    );
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });

    await screen.findByText('gw-eu-1');
    fireEvent.click(screen.getByRole('button', { name: 'Issue token…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Gateway name/), {
      target: { value: 'gw-us-2' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Issue token' }),
    );
    await screen.findByText(RAW_TOKEN);

    for (const store of [localStorage, sessionStorage]) {
      const dump = Object.keys(store)
        .map((k) => `${k}=${store.getItem(k) ?? ''}`)
        .join('\n');
      expect(dump).not.toContain(RAW_TOKEN);
    }
  });

  it('revokes a token behind a confirm dialog', async () => {
    listTokens();
    anchor();
    let revoked = false;
    server.use(
      http.delete(cp('/v1/gateway-enrollment-tokens/g1'), () => {
        revoked = true;
        return new Response(null, { status: 204 });
      }),
    );
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });

    await screen.findByText('gw-eu-1');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revoked).toBe(true);
    });
  });

  // Revocation is idempotent server-side. Model the case an operator actually
  // hits: a list still showing a token another admin already revoked. Revoking
  // it again must read as an ordinary success, not an error. The list is held
  // stale on purpose so the second Revoke is reachable.
  it('treats a repeat revoke as success (idempotent)', async () => {
    let calls = 0;
    server.use(
      http.get(cp('/v1/gateway-enrollment-tokens'), () =>
        ok({ gatewayEnrollmentTokens: tokens }),
      ),
      http.delete(cp('/v1/gateway-enrollment-tokens/g1'), () => {
        calls += 1;
        return new Response(null, { status: 204 });
      }),
    );
    anchor();
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });
    await screen.findByText('gw-eu-1');

    for (const expected of [1, 2]) {
      fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', {
          name: 'Revoke',
        }),
      );
      await waitFor(() => {
        expect(calls).toBe(expected);
      });
      // Success closes the dialog; a failure would keep it open with an alert.
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    }

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Not permitted')).not.toBeInTheDocument();
  });

  it('renders an empty state when there are no tokens', async () => {
    listTokens([]);
    anchor();
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });
    expect(
      await screen.findByText('No active enrollment tokens.'),
    ).toBeInTheDocument();
  });

  it('surfaces an RFC 9457 problem on failure', async () => {
    server.use(
      http.get(cp('/v1/gateway-enrollment-tokens'), () =>
        problem(500, 'Kaboom'),
      ),
    );
    anchor();
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });
    expect(await screen.findByText('Kaboom')).toBeInTheDocument();
  });

  it('renders a 403 as a not-permitted message', async () => {
    server.use(
      http.get(cp('/v1/gateway-enrollment-tokens'), () => problem(403, 'Nope')),
    );
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
  });

  it('hides issue/revoke and the trust anchor without gateway:enroll', async () => {
    listTokens();
    anchor();
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['audit:read'],
    });
    await screen.findByText('gw-eu-1');
    expect(
      screen.queryByRole('button', { name: 'Issue token…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('mTLS trust anchor')).not.toBeInTheDocument();
  });

  it('shows the trust anchor PEM and fingerprint with gateway:enroll', async () => {
    listTokens();
    anchor();
    renderWithProviders(<GatewayEnrollmentTokenList />, {
      authenticated: true,
      permissions: ['gateway:enroll'],
    });

    // Await the fingerprint itself, not the section heading: the heading sits
    // outside the panel's AsyncList and is in the DOM from the first render, so
    // awaiting it returns while the query is still pending.
    expect(
      await screen.findByText(trustAnchor.fingerprintSha256),
    ).toBeInTheDocument();
    expect(screen.getByText('mTLS trust anchor')).toBeInTheDocument();
    expect(
      screen.getByText('CN=SessionLayer Internal mTLS CA,O=SessionLayer'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Trust anchor PEM')).toHaveTextContent(
      'BEGIN CERTIFICATE',
    );
    // Both copy affordances matter: the fingerprint is the operator's only
    // out-of-band check that the anchor they installed is the one the Control
    // Plane served, and the install guide tells them to compare it.
    expect(
      screen.getByRole('button', { name: 'Copy PEM' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy fingerprint' }),
    ).toBeInTheDocument();
  });
});
