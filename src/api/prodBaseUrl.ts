/**
 * A credential-bearing endpoint MUST be https:// (OIDC bearer, PKCE exchange on wire).
 */

/** True for loopback hosts (the local-dev exemption). */
export function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

export function insecureEndpointError(
  name: string,
  url: string,
): string | undefined {
  if (url.length === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${name} must be a valid https:// URL in production (got "${url}")`;
  }
  if (isLoopbackHost(parsed.hostname)) return undefined;
  if (parsed.protocol === 'https:') return undefined;
  return `${name} must be https:// in production (got "${url}")`;
}
