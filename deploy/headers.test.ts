import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertHttpsBasesPlugin, httpsBaseViolations } from './httpsGuard';

function read(relative: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative, import.meta.url)),
    'utf8',
  );
}

function parseCsp(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const clause of policy.split(';')) {
    const [name, ...values] = clause.trim().split(/\s+/).filter(Boolean);
    if (name !== undefined) map.set(name.toLowerCase(), values);
  }
  return map;
}

const nginxHeaders = read('./security-headers.conf');
const staticHeaders = read('./_headers');

const nginxCsp = /Content-Security-Policy\s+"([^"]+)"/.exec(nginxHeaders);
const staticCsp = /Content-Security-Policy:\s*(.+)/.exec(staticHeaders);

interface ServingConfig {
  name: string;
  csp: string;
  raw: string;
  connectPlaceholder: string;
}

const configs: ServingConfig[] = [
  {
    name: 'security-headers.conf (nginx)',
    csp: nginxCsp?.[1] ?? '',
    raw: nginxHeaders,
    connectPlaceholder: '__CP_ORIGIN__',
  },
  {
    name: '_headers (static host)',
    csp: staticCsp?.[1] ?? '',
    raw: staticHeaders,
    connectPlaceholder: 'REPLACE-',
  },
];

describe.each(configs)('$name — Content-Security-Policy', (cfg) => {
  const csp = parseCsp(cfg.csp);

  it('is present', () => {
    expect(cfg.csp.length).toBeGreaterThan(0);
  });

  it('locks the strict base directives', () => {
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it("never weakens the policy with 'unsafe-inline' / 'unsafe-eval'", () => {
    expect(cfg.csp).not.toContain("'unsafe-inline'");
    expect(cfg.csp).not.toContain("'unsafe-eval'");
  });

  it('templates connect-src to a deploy-time allow-list including self', () => {
    const connect = csp.get('connect-src');
    expect(connect).toBeDefined();
    expect(connect).toContain("'self'");
    expect(cfg.csp).toContain(cfg.connectPlaceholder);
  });
});

describe.each(configs)('$name — hardening response headers', (cfg) => {
  it('sends a >=2yr HSTS with includeSubDomains + preload', () => {
    const hsts = /Strict-Transport-Security[":\s]+([^"\n]+)/.exec(cfg.raw);
    const value = hsts?.[1] ?? '';
    expect(
      Number(/max-age=(\d+)/.exec(value)?.[1] ?? 0),
    ).toBeGreaterThanOrEqual(63072000);
    expect(value).toContain('includeSubDomains');
    expect(value).toContain('preload');
  });

  it('sends nosniff, no-referrer, and DENY framing', () => {
    expect(cfg.raw).toMatch(/X-Content-Type-Options[":\s]+nosniff/);
    expect(cfg.raw).toMatch(/Referrer-Policy[":\s]+no-referrer/);
    expect(cfg.raw).toMatch(/X-Frame-Options[":\s]+DENY/);
  });
});

describe('build-time https guard', () => {
  it('fires on a non-localhost, non-https CP base', () => {
    expect(
      httpsBaseViolations({ VITE_CP_BASE_URL: 'http://cp.prod.example' }),
    ).toHaveLength(1);
  });

  it('fires on an insecure OIDC issuer AND redirect_uri (both carry secrets)', () => {
    expect(
      httpsBaseViolations({ VITE_OIDC_ISSUER: 'http://idp.prod.example' }),
    ).toHaveLength(1);
    expect(
      httpsBaseViolations({
        VITE_OIDC_REDIRECT_URI: 'http://app.prod.example/auth/callback',
      }),
    ).toHaveLength(1);
  });

  it('passes https prod endpoints, including an uppercase HTTPS:// scheme', () => {
    expect(
      httpsBaseViolations({
        VITE_CP_BASE_URL: 'https://cp.prod.example',
        VITE_OIDC_ISSUER: 'HTTPS://idp.prod.example',
      }),
    ).toEqual([]);
  });

  it('fails closed on a malformed non-empty value', () => {
    expect(httpsBaseViolations({ VITE_CP_BASE_URL: 'not a url' })).toHaveLength(
      1,
    );
  });

  it('exempts localhost and unset (the single-instance dev default)', () => {
    expect(
      httpsBaseViolations({ VITE_CP_BASE_URL: 'http://localhost:8080' }),
    ).toEqual([]);
    expect(
      httpsBaseViolations({ VITE_CP_BASE_URL: 'http://127.0.0.1:8080' }),
    ).toEqual([]);
    expect(httpsBaseViolations({ VITE_CP_BASE_URL: '' })).toEqual([]);
    expect(httpsBaseViolations({})).toEqual([]);
  });

  it('is a build-only Vite plugin', () => {
    const plugin = assertHttpsBasesPlugin();
    expect(plugin.name).toBe('sl-assert-https-bases');
    expect(plugin.apply).toBe('build');
  });
});
