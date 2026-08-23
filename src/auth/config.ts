import { insecureEndpointError } from '../api/prodBaseUrl';
import { endpoint, endpointValue } from '../config/runtime';

export interface OidcConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  scope: string;
}

function defaultRedirectUri(): string {
  if (typeof window === 'undefined')
    return 'http://localhost:5173/auth/callback';
  return `${window.location.origin}/auth/callback`;
}

export function loadOidcConfig(): OidcConfig {
  const issuer = endpointValue('OIDC_ISSUER') ?? '';
  const base = issuer.replace(/\/$/, '');
  const config: OidcConfig = {
    issuer,
    clientId: endpointValue('OIDC_CLIENT_ID') ?? 'sessionlayer-dashboard',
    redirectUri: endpointValue('OIDC_REDIRECT_URI') ?? defaultRedirectUri(),
    authorizeEndpoint:
      endpointValue('OIDC_AUTHORIZE_ENDPOINT') ??
      (base ? `${base}/authorize` : ''),
    tokenEndpoint:
      endpointValue('OIDC_TOKEN_ENDPOINT') ??
      (base ? `${base}/oauth2/token` : ''),
    scope: endpointValue('OIDC_SCOPE') ?? 'openid profile email',
  };
  if (import.meta.env.PROD) {
    for (const [key, url] of [
      ['OIDC_ISSUER', config.issuer],
      ['OIDC_AUTHORIZE_ENDPOINT', config.authorizeEndpoint],
      ['OIDC_TOKEN_ENDPOINT', config.tokenEndpoint],
      ['OIDC_REDIRECT_URI', config.redirectUri],
    ] as const) {
      // redirectUri defaults to this page's own origin, which no variable set,
      // so name the variable only where one supplied the value.
      const insecure = insecureEndpointError(
        endpoint(key)?.source ?? `SL_${key}`,
        url,
      );
      if (insecure !== undefined) throw new Error(insecure);
    }
  }
  return config;
}

export function isOidcConfigured(config: OidcConfig): boolean {
  return config.authorizeEndpoint !== '' && config.tokenEndpoint !== '';
}
