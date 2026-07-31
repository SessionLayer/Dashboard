import { screen } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { cp, ok, page, problem } from '../../test/msw';
import { server } from '../../test/server';
import { renderWithProviders } from '../../test/utils';
import type { CaKind, CaPublicKey } from '../../api/types';
import { CasScreen } from './CasScreen';

const OPENSSH_LINE =
  'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBPYAI1wbmxuq1aw5Jd40HXdnYEfDG+jK7cEanzalp7OD7PSW6ThuMrwWeekQ+n+JGWujDob+UI1HMhRnTXP2lAg= sessionlayer-session-ca';

const publicKey = (caKind: CaKind): CaPublicKey => ({
  caKind,
  algorithm: 'ecdsa-p256',
  rotationState: 'active',
  publicKeySpkiDer: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE',
  opensshPublicKey: `${OPENSSH_LINE}-${caKind}`,
  fingerprint: `SHA256:fingerprint-of-the-${caKind}-ca`,
});

function serveCas(): void {
  server.use(
    http.get(cp('/v1/cas'), () => page([])),
    http.get(cp('/v1/cas/session/public-key'), () => ok(publicKey('session'))),
    http.get(cp('/v1/cas/user/public-key'), () => ok(publicKey('user'))),
    http.get(cp('/v1/cas/host/public-key'), () => ok(publicKey('host'))),
  );
}

describe('CaPublicKeyPanel', () => {
  it('exports the three SSH CA public keys with copy affordances', async () => {
    serveCas();
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: ['node:enroll'],
    });

    expect(
      await screen.findByText('SHA256:fingerprint-of-the-session-ca'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('SHA256:fingerprint-of-the-user-ca'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('SHA256:fingerprint-of-the-host-ca'),
    ).toBeInTheDocument();

    // The authorized-key line is what an operator pastes into TrustedUserCAKeys,
    // so it has to be present verbatim and copyable, not summarised.
    expect(
      screen.getByLabelText('session CA OpenSSH public key'),
    ).toHaveTextContent(`${OPENSSH_LINE}-session`);
    expect(
      screen.getAllByRole('button', { name: 'Copy OpenSSH line' }),
    ).toHaveLength(3);
    expect(
      screen.getAllByRole('button', { name: 'Copy fingerprint' }),
    ).toHaveLength(3);
  });

  // The internal mTLS CA is not a member of this collection — it has its own
  // trust-anchor export beside the Gateway enrollment tokens.
  it('does not offer the internal mTLS CA here', async () => {
    serveCas();
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: ['node:enroll'],
    });
    await screen.findByText('SHA256:fingerprint-of-the-session-ca');
    expect(screen.queryByText(/mtls CA/i)).not.toBeInTheDocument();
  });

  it('hides the export from a caller without node:enroll', async () => {
    server.use(http.get(cp('/v1/cas'), () => page([])));
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: ['ca:manage'],
    });
    await screen.findByText('No certificate authorities yet');
    expect(screen.queryByText('CA public keys')).not.toBeInTheDocument();
  });

  // One kind having no CA must not take the other two down with it.
  it('reports a missing kind inline and still exports the others', async () => {
    server.use(
      http.get(cp('/v1/cas'), () => page([])),
      http.get(cp('/v1/cas/session/public-key'), () =>
        ok(publicKey('session')),
      ),
      http.get(cp('/v1/cas/user/public-key'), () => ok(publicKey('user'))),
      http.get(cp('/v1/cas/host/public-key'), () =>
        problem(404, 'No host CA', 'No active host CA exists.'),
      ),
    );
    renderWithProviders(<CasScreen />, {
      authenticated: true,
      permissions: ['node:enroll'],
    });

    expect(
      await screen.findByText('SHA256:fingerprint-of-the-session-ca'),
    ).toBeInTheDocument();
    expect(await screen.findByText('No host CA')).toBeInTheDocument();
  });
});
