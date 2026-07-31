import type { OidcConfig } from './config';

/**
 * PKCE makes public client code exchange safe. Bearer is NEVER written to web storage (see tokenStore).
 */
const TRANSIENT_KEY = 'sl.oidc.pkce';

export interface PkceTransient {
  verifier: string;
  state: string;
  nonce: string;
}

export interface TokenSet {
  bearer: string;
  expiresIn: number | undefined;
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(digest);
}

export function createTransient(): PkceTransient {
  return {
    verifier: randomToken(64),
    state: randomToken(),
    nonce: randomToken(),
  };
}

export function storeTransient(t: PkceTransient): void {
  sessionStorage.setItem(TRANSIENT_KEY, JSON.stringify(t));
}

/** Read and immediately delete the transient (single-use). */
export function takeTransient(): PkceTransient | undefined {
  const raw = sessionStorage.getItem(TRANSIENT_KEY);
  sessionStorage.removeItem(TRANSIENT_KEY);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as PkceTransient;
  } catch {
    return undefined;
  }
}

export async function buildAuthorizeUrl(
  config: OidcConfig,
  t: PkceTransient,
): Promise<string> {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state: t.state,
    nonce: t.nonce,
    code_challenge: await challengeFor(t.verifier),
    code_challenge_method: 'S256',
  });
  return `${config.authorizeEndpoint}?${params.toString()}`;
}

export async function exchangeCode(
  config: OidcConfig,
  code: string,
  verifier: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
  const res = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    // Serialize to the encoded string rather than passing the URLSearchParams
    // instance (avoids a cross-realm identity mismatch in the interceptor).
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (HTTP ${String(res.status)})`);
  }
  const json = (await res.json()) as {
    id_token?: unknown;
    access_token?: unknown;
    expires_in?: unknown;
  };
  const bearer =
    (typeof json.id_token === 'string' ? json.id_token : undefined) ??
    (typeof json.access_token === 'string' ? json.access_token : undefined);
  if (bearer === undefined) {
    throw new Error('Token response contained no id_token or access_token');
  }
  return {
    bearer,
    expiresIn:
      typeof json.expires_in === 'number' ? json.expires_in : undefined,
  };
}
