import { afterEach, describe, expect, it, vi } from 'vitest';

import { endpoint, endpointConfigError, endpointValue } from './runtime';

function servedConfig(config: Record<string, string> | undefined): void {
  if (config === undefined) delete window.__SL_RUNTIME_CONFIG__;
  else window.__SL_RUNTIME_CONFIG__ = Object.freeze(config);
}

afterEach(() => {
  servedConfig(undefined);
  vi.unstubAllEnvs();
});

describe('endpoint resolution', () => {
  it('prefers what the container wrote over what the build baked', () => {
    vi.stubEnv('VITE_CP_BASE_URL', 'https://baked.example');
    servedConfig({ CP_BASE_URL: 'https://served.example' });
    expect(endpoint('CP_BASE_URL')).toEqual({
      value: 'https://served.example',
      source: 'SL_CP_BASE_URL',
    });
  });

  it('falls back to the baked value where no container wrote one', () => {
    vi.stubEnv('VITE_CP_BASE_URL', 'https://baked.example');
    servedConfig({});
    expect(endpoint('CP_BASE_URL')).toEqual({
      value: 'https://baked.example',
      source: 'VITE_CP_BASE_URL',
    });
  });

  it('treats blank and whitespace as unset in either place', () => {
    servedConfig({ CP_BASE_URL: '   ' });
    vi.stubEnv('VITE_CP_BASE_URL', '');
    expect(endpointValue('CP_BASE_URL')).toBeUndefined();
  });
});

describe('endpointConfigError', () => {
  it('says nothing in a development build, where localhost is the point', () => {
    servedConfig({});
    expect(endpointConfigError()).toBeUndefined();
  });

  it('refuses to render an app with no Control Plane endpoint', () => {
    vi.stubEnv('PROD', true);
    servedConfig({});
    expect(endpointConfigError()).toContain('No Control Plane endpoint');
  });

  it('names the variable that carried the cleartext endpoint', () => {
    vi.stubEnv('PROD', true);
    servedConfig({
      CP_BASE_URL: 'https://cp.example',
      OIDC_TOKEN_ENDPOINT: 'http://idp.example/oauth2/token',
    });
    expect(endpointConfigError()).toContain('SL_OIDC_TOKEN_ENDPOINT');
  });

  it('accepts a loopback endpoint, the single-instance evaluation case', () => {
    vi.stubEnv('PROD', true);
    servedConfig({ CP_BASE_URL: 'http://localhost:8080' });
    expect(endpointConfigError()).toBeUndefined();
  });
});
