import { describe, expect, it } from 'vitest';

import { insecureEndpointError, isLoopbackHost } from './prodBaseUrl';

describe('production endpoint https guard (runtime backstop)', () => {
  it('exempts the loopback dev defaults', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('cp.example')).toBe(false);
    expect(
      insecureEndpointError('VITE_CP_BASE_URL', 'http://localhost:8080'),
    ).toBeUndefined();
    expect(
      insecureEndpointError('VITE_CP_BASE_URL', 'http://127.0.0.1:8080'),
    ).toBeUndefined();
  });

  it('allows an https non-localhost endpoint', () => {
    expect(
      insecureEndpointError('VITE_CP_BASE_URL', 'https://controlplane.example'),
    ).toBeUndefined();
  });

  it('accepts an uppercase HTTPS:// scheme (parser-normalized, not startsWith)', () => {
    expect(
      insecureEndpointError('VITE_CP_BASE_URL', 'HTTPS://controlplane.example'),
    ).toBeUndefined();
  });

  it('allows an empty value (falls back to a localhost default)', () => {
    expect(insecureEndpointError('VITE_CP_BASE_URL', '')).toBeUndefined();
  });

  it('REJECTS a cleartext non-localhost endpoint (the secret would ride http)', () => {
    const err = insecureEndpointError(
      'VITE_OIDC_TOKEN_ENDPOINT',
      'http://idp.example/oauth2/token',
    );
    expect(err).toContain('https://');
    expect(err).toContain('VITE_OIDC_TOKEN_ENDPOINT');
    expect(err).toContain('idp.example');
  });

  it('rejects a non-https scheme to a remote host', () => {
    expect(
      insecureEndpointError('VITE_CP_BASE_URL', 'ws://controlplane.example'),
    ).toContain('https://');
  });

  it('fails closed on a malformed non-empty value', () => {
    expect(insecureEndpointError('VITE_CP_BASE_URL', 'not a url')).toContain(
      'VITE_CP_BASE_URL',
    );
  });
});
