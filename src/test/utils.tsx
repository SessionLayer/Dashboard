import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { AuthProvider } from '../auth/AuthContext';
import type { OidcConfig } from '../auth/config';
import { setBearer } from '../auth/tokenStore';
import type { PlatformPermission } from '../api/types';

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

export function renderWithClient(ui: ReactElement): RenderResult {
  return render(
    <QueryClientProvider client={freshClient()}>{ui}</QueryClientProvider>,
  );
}

function b64url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function makeTestJwt(payload: Record<string, unknown>): string {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

const noopRedirect = () => {
  /* never navigate in tests */
};

const testOidcConfig: OidcConfig = {
  issuer: 'https://idp.test',
  clientId: 'test-client',
  redirectUri: 'http://localhost/auth/callback',
  authorizeEndpoint: 'https://idp.test/authorize',
  tokenEndpoint: 'https://idp.test/oauth2/token',
  scope: 'openid profile email',
};

export interface ProviderOptions {
  authenticated?: boolean;
  permissions?: PlatformPermission[];
  name?: string;
  redirect?: (url: string) => void;
}

export function seedAuth(
  permissions: PlatformPermission[] = [],
  name = 'Test Admin',
): void {
  setBearer(
    makeTestJwt({
      sub: 'admin@test',
      name,
      permissions,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
}

function Providers({
  children,
  options,
}: {
  children: ReactNode;
  options: ProviderOptions;
}) {
  if (options.authenticated === true) {
    seedAuth(options.permissions, options.name);
  }
  return (
    <QueryClientProvider client={freshClient()}>
      <AuthProvider
        config={testOidcConfig}
        redirect={options.redirect ?? noopRedirect}
      >
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions = {},
): RenderResult {
  return render(<Providers options={options}>{ui}</Providers>);
}

export { testOidcConfig };
