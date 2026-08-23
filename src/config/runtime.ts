import { insecureEndpointError } from '../api/prodBaseUrl';

// Endpoints reach the bundle two ways. A container writes /config.js from its
// SL_* environment at start (deploy/runtime-config.sh); a build that bakes
// VITE_ values - a static host, `npm run dev` - has none. Runtime wins where
// both exist, because it is the one an operator can change without a rebuild.
declare global {
  interface Window {
    __SL_RUNTIME_CONFIG__?: Readonly<Record<string, string>>;
  }
}

export interface Endpoint {
  value: string;
  /** The variable this value came from, so a rejection names what to fix. */
  source: string;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

export function endpoint(key: string): Endpoint | undefined {
  const runtime =
    typeof window === 'undefined'
      ? undefined
      : nonEmpty(window.__SL_RUNTIME_CONFIG__?.[key]);
  if (runtime !== undefined) return { value: runtime, source: `SL_${key}` };

  const baked = nonEmpty(import.meta.env[`VITE_${key}`] as string | undefined);
  if (baked !== undefined) return { value: baked, source: `VITE_${key}` };

  return undefined;
}

export function endpointValue(key: string): string | undefined {
  return endpoint(key)?.value;
}

const HTTPS_REQUIRED = [
  'CP_BASE_URL',
  'OIDC_ISSUER',
  'OIDC_AUTHORIZE_ENDPOINT',
  'OIDC_TOKEN_ENDPOINT',
  'OIDC_REDIRECT_URI',
] as const;

/**
 * The container refuses to start on a bad endpoint, and this is the same rule
 * applied where a bundle can also be served by something that never ran that
 * check - a static host, an operator's own nginx. Reported on the page rather
 * than thrown, because the person who set the endpoints is not in devtools.
 */
export function endpointConfigError(): string | undefined {
  if (!import.meta.env.PROD) return undefined;

  if (endpoint('CP_BASE_URL') === undefined) {
    return (
      'No Control Plane endpoint. The image carries none of its own: its ' +
      'entrypoint writes /config.js from SL_CP_BASE_URL at container start, ' +
      'and this page loaded without one.'
    );
  }

  for (const key of HTTPS_REQUIRED) {
    const found = endpoint(key);
    if (found === undefined) continue;
    const insecure = insecureEndpointError(found.source, found.value);
    if (insecure !== undefined) return insecure;
  }
  return undefined;
}
