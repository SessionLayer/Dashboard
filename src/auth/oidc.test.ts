import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/server';
import { testOidcConfig } from '../test/utils';
import {
  buildAuthorizeUrl,
  createTransient,
  exchangeCode,
  storeTransient,
  takeTransient,
} from './oidc';

describe('OIDC PKCE helpers', () => {
  it('creates a distinct verifier/state/nonce transient', () => {
    const t = createTransient();
    expect(t.verifier.length).toBeGreaterThan(40);
    expect(t.state).not.toBe(t.nonce);
    expect(t.state).not.toBe(t.verifier);
  });

  it('stores the transient in sessionStorage and consumes it single-use', () => {
    const t = createTransient();
    storeTransient(t);
    expect(takeTransient()).toEqual(t);
    expect(takeTransient()).toBeUndefined();
  });

  it('builds an authorize URL with an S256 challenge, state, and PKCE params', async () => {
    const t = createTransient();
    const url = new URL(await buildAuthorizeUrl(testOidcConfig, t));
    expect(url.origin + url.pathname).toBe('https://idp.test/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')?.length).toBeGreaterThan(20);
    expect(url.searchParams.get('state')).toBe(t.state);
    expect(url.searchParams.get('client_id')).toBe('test-client');
  });

  it('exchanges the code for the ID token as the bearer', async () => {
    server.use(
      http.post(testOidcConfig.tokenEndpoint, () =>
        HttpResponse.json({
          id_token: 'THE.ID.TOKEN',
          access_token: 'access',
          expires_in: 3600,
        }),
      ),
    );
    const set = await exchangeCode(testOidcConfig, 'code123', 'verifier');
    expect(set.bearer).toBe('THE.ID.TOKEN');
    expect(set.expiresIn).toBe(3600);
  });

  it('falls back to the access token when no ID token is returned', async () => {
    server.use(
      http.post(testOidcConfig.tokenEndpoint, () =>
        HttpResponse.json({
          access_token: 'ACCESS.ONLY',
          token_type: 'Bearer',
        }),
      ),
    );
    const set = await exchangeCode(testOidcConfig, 'c', 'v');
    expect(set.bearer).toBe('ACCESS.ONLY');
  });

  it('throws on a failed token exchange', async () => {
    server.use(
      http.post(testOidcConfig.tokenEndpoint, () =>
        HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }),
      ),
    );
    await expect(exchangeCode(testOidcConfig, 'c', 'v')).rejects.toThrow();
  });
});
