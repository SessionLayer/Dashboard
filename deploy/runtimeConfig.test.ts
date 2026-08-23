import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { httpsBaseViolations } from './httpsGuard';

// Not new URL(..., import.meta.url): Vite rewrites that pattern into an asset
// reference. Vitest runs from the repository root.
const SCRIPT = join(process.cwd(), 'deploy/runtime-config.sh');
const scratch: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

interface Start {
  ok: boolean;
  stderr: string;
  connectSrc: string;
  config: string;
}

/**
 * Sources the script the way the nginx entrypoint does, which is the only way
 * to see the SL_CSP_CONNECT_SRC it exports - and the reason its refusals end
 * container startup rather than just the script.
 */
function start(env: Record<string, string>): Start {
  const out = mkdtempSync(join(tmpdir(), 'sl-runtime-config-'));
  scratch.push(out);
  const result = spawnSync(
    'sh',
    ['-c', `. "$0"; printf '%s' "$SL_CSP_CONNECT_SRC"`, SCRIPT],
    {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, NGINX_ENVSUBST_OUTPUT_DIR: out, ...env },
    },
  );
  return {
    config: existsSync(join(out, 'config.js'))
      ? readFileSync(join(out, 'config.js'), 'utf8')
      : '',
    ok: result.status === 0,
    stderr: result.stderr,
    connectSrc: result.stdout.split('\n').pop() ?? '',
  };
}

function configured(config: string, key: string): string {
  return new RegExp(`"${key}": "([^"]*)"`).exec(config)?.[1] ?? '';
}

const CP = 'https://cp.prod.example';

// One table, two enforcers. httpsBaseViolations rejects a value a build bakes
// in; runtime-config.sh rejects the same value arriving as environment. They
// are written in different languages and would otherwise drift apart.
const ENDPOINT_CASES: { value: string; accepted: boolean }[] = [
  { value: 'https://cp.prod.example', accepted: true },
  { value: 'HTTPS://cp.prod.example', accepted: true },
  { value: 'https://cp.prod.example:8443/api', accepted: true },
  { value: 'https://user:pw@cp.prod.example', accepted: true },
  { value: 'http://localhost:8080', accepted: true },
  { value: 'http://127.0.0.1:8080', accepted: true },
  { value: 'http://[::1]:8080', accepted: true },
  { value: 'http://cp.prod.example', accepted: false },
  { value: 'http://127.0.0.2:8080', accepted: false },
  { value: 'ftp://cp.prod.example', accepted: false },
  { value: 'not a url', accepted: false },
  { value: '//cp.prod.example', accepted: false },
  { value: 'https://', accepted: false },
];

const ENDPOINTS = [
  'CP_BASE_URL',
  'OIDC_ISSUER',
  'OIDC_AUTHORIZE_ENDPOINT',
  'OIDC_TOKEN_ENDPOINT',
  'OIDC_REDIRECT_URI',
] as const;

describe.each(ENDPOINTS)(
  '%s - the build guard and the entrypoint agree',
  (key) => {
    it.each(ENDPOINT_CASES)('$value', ({ value, accepted }) => {
      expect(httpsBaseViolations({ [`VITE_${key}`]: value })).toHaveLength(
        accepted ? 0 : 1,
      );
      expect(start({ SL_CP_BASE_URL: CP, [`SL_${key}`]: value }).ok).toBe(
        accepted,
      );
    });
  },
);

describe('runtime-config.sh', () => {
  it('serves two deployments from one image', () => {
    const a = start({
      SL_CP_BASE_URL: 'https://cp.a.example',
      SL_OIDC_ISSUER: 'https://idp.a.example',
    });
    const b = start({
      SL_CP_BASE_URL: 'https://cp.b.example',
      SL_OIDC_ISSUER: 'https://idp.b.example',
      SL_OIDC_CLIENT_ID: 'dashboard-b',
    });

    expect(configured(a.config, 'CP_BASE_URL')).toBe('https://cp.a.example');
    expect(configured(b.config, 'CP_BASE_URL')).toBe('https://cp.b.example');
    expect(configured(a.config, 'OIDC_CLIENT_ID')).toBe(
      'sessionlayer-dashboard',
    );
    expect(configured(b.config, 'OIDC_CLIENT_ID')).toBe('dashboard-b');
    expect(a.connectSrc).not.toBe(b.connectSrc);
  });

  it('fills the OIDC endpoints the app would otherwise derive for itself', () => {
    const { config } = start({
      SL_CP_BASE_URL: CP,
      SL_OIDC_ISSUER: 'https://idp.prod.example/',
    });
    expect(configured(config, 'OIDC_ISSUER')).toBe('https://idp.prod.example');
    expect(configured(config, 'OIDC_AUTHORIZE_ENDPOINT')).toBe(
      'https://idp.prod.example/authorize',
    );
    expect(configured(config, 'OIDC_TOKEN_ENDPOINT')).toBe(
      'https://idp.prod.example/oauth2/token',
    );
  });

  it('allows exactly the origins the config it wrote will be fetched from', () => {
    const { config, connectSrc } = start({
      SL_CP_BASE_URL: 'https://cp.prod.example:8443/v1',
      SL_OIDC_ISSUER: 'https://idp.prod.example',
      SL_OBJECT_STORE_ORIGIN:
        'https://objects.prod.example:443 https://cp.prod.example:8443',
    });
    expect(connectSrc.split(' ').filter(Boolean).sort()).toEqual([
      'https://cp.prod.example:8443',
      'https://idp.prod.example',
      'https://objects.prod.example',
    ]);
    for (const key of ['CP_BASE_URL', 'OIDC_TOKEN_ENDPOINT']) {
      expect(connectSrc).toContain(
        new URL(configured(config, key)).origin.toLowerCase(),
      );
    }
  });

  it('refuses to start with no Control Plane endpoint', () => {
    const { ok, stderr, config } = start({});
    expect(ok).toBe(false);
    expect(stderr).toContain('SL_CP_BASE_URL is unset');
    expect(config).toBe('');
  });

  it('refuses a build-time variable name, which would silently do nothing', () => {
    const { ok, stderr } = start({
      SL_CP_BASE_URL: CP,
      VITE_CP_BASE_URL: 'https://elsewhere.example',
    });
    expect(ok).toBe(false);
    expect(stderr).toContain('has no effect on a running container');
  });

  it('refuses a hand-set connect-src, which could disagree with the endpoints', () => {
    const { ok, stderr } = start({
      SL_CP_BASE_URL: CP,
      SL_CSP_CONNECT_SRC: 'https://anything.example',
    });
    expect(ok).toBe(false);
    expect(stderr).toContain('derived from the endpoints');
  });

  it('refuses a value that would break out of the string it is written into', () => {
    const { ok, config } = start({
      SL_CP_BASE_URL: `${CP}"});alert(1)//`,
    });
    expect(ok).toBe(false);
    expect(config).toBe('');
  });

  it('reports every violation at once, not just the first', () => {
    const { stderr } = start({
      SL_CP_BASE_URL: 'http://cp.prod.example',
      SL_OIDC_TOKEN_ENDPOINT: 'http://idp.prod.example/oauth2/token',
    });
    expect(stderr).toContain('SL_CP_BASE_URL must be https://');
    expect(stderr).toContain('SL_OIDC_TOKEN_ENDPOINT must be https://');
  });
});
