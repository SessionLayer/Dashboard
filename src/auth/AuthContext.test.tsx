import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { server } from '../test/server';
import { makeTestJwt, seedAuth, testOidcConfig } from '../test/utils';
import { AuthProvider, useAuth } from './AuthContext';
import type { OidcConfig } from './config';

function primeTransient(nonce: string): void {
  sessionStorage.setItem(
    'sl.oidc.pkce',
    JSON.stringify({ verifier: 'v', state: 's', nonce }),
  );
}

function wrapper(config: OidcConfig) {
  return function Wrap({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider config={config} redirect={() => undefined}>
          {children}
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe('AuthContext RBAC-aware affordances', () => {
  it('hides actions the user lacks a permission for when permissions are known', () => {
    seedAuth(['rbac:read']);
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(testOidcConfig),
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.permissionsKnown).toBe(true);
    expect(result.current.can('rbac:read')).toBe(true);
    expect(result.current.can('rbac:write')).toBe(false);
  });

  it('is optimistic (server is the gate) when the token carries no permission claims', () => {
    seedAuth([]);
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(testOidcConfig),
    });
    expect(result.current.permissionsKnown).toBe(false);
    expect(result.current.can('recording:replay')).toBe(true);
  });

  it('reports unconfigured OIDC and refuses to start a login', async () => {
    const unconfigured: OidcConfig = {
      ...testOidcConfig,
      authorizeEndpoint: '',
      tokenEndpoint: '',
    };
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(unconfigured),
    });
    expect(result.current.configured).toBe(false);
    await expect(result.current.login()).rejects.toThrow(/not configured/i);
  });

  it('accepts a callback whose ID-token nonce matches', async () => {
    server.use(
      http.post(testOidcConfig.tokenEndpoint, () =>
        HttpResponse.json({ id_token: makeTestJwt({ sub: 'a', nonce: 'N1' }) }),
      ),
    );
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(testOidcConfig),
    });
    primeTransient('N1');
    await act(async () => {
      await result.current.completeCallback('?code=c&state=s');
    });
    expect(result.current.status).toBe('authenticated');
  });

  it('rejects a callback whose ID-token nonce does not match', async () => {
    server.use(
      http.post(testOidcConfig.tokenEndpoint, () =>
        HttpResponse.json({
          id_token: makeTestJwt({ sub: 'a', nonce: 'ATTACKER' }),
        }),
      ),
    );
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(testOidcConfig),
    });
    primeTransient('N1');
    await expect(
      result.current.completeCallback('?code=c&state=s'),
    ).rejects.toThrow(/nonce mismatch/i);
    expect(result.current.status).toBe('unauthenticated');
  });

  it('rejects a callback whose state does not match (CSRF guard)', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(testOidcConfig),
    });
    sessionStorage.setItem(
      'sl.oidc.pkce',
      JSON.stringify({ verifier: 'v', state: 'expected', nonce: 'n' }),
    );
    await expect(
      result.current.completeCallback('?code=abc&state=WRONG'),
    ).rejects.toThrow(/state mismatch/i);
  });

  it('signs out to unauthenticated', async () => {
    seedAuth(['audit:read']);
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(testOidcConfig),
    });
    act(() => {
      result.current.logout();
    });
    await waitFor(() => {
      expect(result.current.status).toBe('unauthenticated');
    });
  });
});
