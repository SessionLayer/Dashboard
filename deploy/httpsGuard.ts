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

/** Opting out is deliberate and auditable: the published evaluation image sets it. */
export const UNCONFIGURED_OPT_IN = 'SL_ALLOW_UNCONFIGURED_BUILD';

export function httpsBaseViolations(
  env: Record<string, string | undefined>,
  optIn: string | undefined = undefined,
): string[] {
  const violations: string[] = [];

  // Vite inlines these at build time, and an unset VITE_CP_BASE_URL falls back
  // to http://localhost:8080 — a loopback value, which the scheme check below
  // exempts. So an unconfigured production build used to succeed and ship a
  // bundle whose API base is the browser's own machine. That image cannot be
  // repointed afterwards, so the refusal belongs here, at the only moment the
  // endpoint can still be chosen.
  const base = env.VITE_CP_BASE_URL?.trim();
  if ((base === undefined || base.length === 0) && !optIn) {
    violations.push(
      `VITE_CP_BASE_URL is unset, so this build would inline http://localhost:8080 as the ` +
        `Control Plane endpoint and could never be pointed anywhere else. Set it, or set ` +
        `${UNCONFIGURED_OPT_IN}=1 if an unconfigured evaluation image is what you meant.`,
    );
  }

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
      // The opt-in is read from the process environment, not from loadEnv's
      // VITE_ prefix: it must not be inlined into the bundle, and it must not
      // be settable from a checked-in .env file.
      const violations = httpsBaseViolations(
        loadEnv(mode, process.cwd(), 'VITE_'),
        process.env[UNCONFIGURED_OPT_IN],
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
