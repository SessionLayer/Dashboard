import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import {
  clearBearer,
  setBearer,
  setUnauthorizedHandler,
} from '../auth/tokenStore';
import { cp } from '../test/msw';
import { server } from '../test/server';
import { api } from './client';

describe('Control Plane client middleware', () => {
  it('injects the in-memory bearer as an Authorization header', async () => {
    let seen: string | null = null;
    server.use(
      http.get(cp('/v1/version'), ({ request }) => {
        seen = request.headers.get('Authorization');
        return HttpResponse.json({
          component: 'x',
          version: '0',
          protocols: {
            controlPlaneGatewayGrpc: { min: '1.0', max: '1.0' },
            agentGatewayWire: { min: '1.0', max: '1.0' },
          },
        });
      }),
    );
    setBearer('test.jwt.token');
    await api.GET('/v1/version');
    expect(seen).toBe('Bearer test.jwt.token');
  });

  it('sends no Authorization header when signed out', async () => {
    let seen: string | null = 'unset';
    server.use(
      http.get(cp('/v1/healthz'), ({ request }) => {
        seen = request.headers.get('Authorization');
        return HttpResponse.json({ status: 'pass' });
      }),
    );
    clearBearer();
    await api.GET('/v1/healthz');
    expect(seen).toBeNull();
  });

  it('invokes the unauthorized handler on a 401', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    server.use(
      http.get(cp('/v1/version'), () =>
        HttpResponse.json(
          { title: 'Unauthorized', status: 401 },
          { status: 401 },
        ),
      ),
    );
    setBearer('expired');
    await api.GET('/v1/version');
    expect(onUnauthorized).toHaveBeenCalledOnce();
    setUnauthorizedHandler(undefined);
  });

  it('NEVER writes the bearer to localStorage or sessionStorage (XSS posture)', () => {
    setBearer('super-secret-bearer-value');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(JSON.stringify(localStorage)).not.toContain('super-secret-bearer');
    expect(JSON.stringify(sessionStorage)).not.toContain('super-secret-bearer');
  });
});
