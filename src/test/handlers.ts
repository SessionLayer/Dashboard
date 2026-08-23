import { http, HttpResponse } from 'msw';

import { CP_BASE_URL } from '../api/client';
import type { HealthStatus, VersionInfo } from '../api/queries';

/**
 * Canonical mock responses, matching the `examples` in the frozen OpenAPI spec
 * (`openapi/openapi.yaml`). No live Control Plane is wired, so every
 * test path resolves against these.
 */
export const versionFixture: VersionInfo = {
  component: 'SessionLayer Control Plane',
  version: '0.1.0',
  protocols: {
    controlPlaneGatewayGrpc: { min: '1.0', max: '1.0' },
    agentGatewayWire: { min: '1.0', max: '1.0' },
  },
};

export const healthFixture: HealthStatus = { status: 'pass' };

export const handlers = [
  http.get(`${CP_BASE_URL}/v1/version`, () =>
    HttpResponse.json(versionFixture),
  ),
  http.get(`${CP_BASE_URL}/v1/healthz`, () => HttpResponse.json(healthFixture)),
];
