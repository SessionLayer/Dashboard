import { loadEnv, type Plugin } from 'vite';

const HTTPS_REQUIRED_VARS = [
  'VITE_CP_BASE_URL',
  'VITE_OIDC_ISSUER',
  'VITE_OIDC_AUTHORIZE_ENDPOINT',
  'VITE_OIDC_TOKEN_ENDPOINT',
  'VITE_OIDC_REDIRECT_URI',
] as const;

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

export function httpsBaseViolations(
  env: Record<string, string | undefined>,
): string[] {
  const violations: string[] = [];
  for (const name of HTTPS_REQUIRED_VARS) {
    const value = env[name]?.trim();
    if (value === undefined || value.length === 0) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      violations.push(
        `${name} must be a valid https:// URL in a production build (got "${value}")`,
      );
      continue;
    }
    if (isLoopback(parsed.hostname)) continue;
    if (parsed.protocol !== 'https:') {
      violations.push(
        `${name} must be https:// in a production build (got "${value}")`,
      );
    }
  }
  return violations;
}

export function assertHttpsBasesPlugin(): Plugin {
  return {
    name: 'sl-assert-https-bases',
    apply: 'build',
    config(_config, { mode }) {
      const violations = httpsBaseViolations(
        loadEnv(mode, process.cwd(), 'VITE_'),
      );
      if (violations.length > 0) {
        throw new Error(
          `Insecure production build blocked:\n  - ${violations.join('\n  - ')}\n` +
            'Set an https:// endpoint, or a localhost value for single-instance dev.',
        );
      }
    },
  };
}
