import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { http, HttpResponse, type RequestHandler } from 'msw';

import { CP_BASE_URL } from '../../api/client';
import type {
  GatewayEnrollmentTokenResource,
  IssuedGatewayEnrollmentToken,
  IssuedJoinToken,
  JoinTokenResource,
  MtlsTrustAnchor,
  NodeResource,
  SessionLeaseResource,
  SessionResource,
} from '../../api/types';
import { NodeList } from './NodeList';
import { SessionPage } from './SessionPage';
import { SessionLeaseList } from './SessionLeaseList';
import { JoinTokenList } from './JoinTokenList';
import { GatewayEnrollmentTokenList } from './GatewayEnrollmentTokenList';

export function createFleetRoutes(parent: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: '/nodes',
      component: NodeList,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/sessions',
      component: SessionPage,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/session-leases',
      component: SessionLeaseList,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/join-tokens',
      component: JoinTokenList,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/gateway-enrollment-tokens',
      component: GatewayEnrollmentTokenList,
    }),
  ];
}

// ---- Optional demo/E2E handlers -------------------------------------------

const demoNodes: NodeResource[] = [
  {
    id: '018f9c00-0000-7000-8000-0000000000a1',
    name: 'web-01',
    connectorKind: 'agentless',
    status: 'active',
    health: 'healthy',
    address: '10.0.1.11:22',
    labels: { env: 'prod', tier: 'web' },
    createdAt: '2026-07-01T09:00:00Z',
    updatedAt: '2026-07-10T09:00:00Z',
  },
  {
    id: '018f9c00-0000-7000-8000-0000000000a2',
    name: 'db-01',
    connectorKind: 'agent',
    status: 'quarantined',
    health: 'unreachable',
    address: '10.0.2.20:22',
    labels: { env: 'prod', tier: 'db' },
    owningGateway: 'gw-eu-1',
    statusReason: 'clone detected',
    createdAt: '2026-07-02T09:00:00Z',
    updatedAt: '2026-07-15T09:00:00Z',
  },
];

const demoTokens: JoinTokenResource[] = [
  {
    id: '018f9c00-0000-7000-8000-0000000000b1',
    nodeName: 'worker-07',
    joinMethod: 'token',
    singleUse: true,
    expiresAt: '2026-07-16T12:00:00Z',
    createdAt: '2026-07-16T11:00:00Z',
    createdBy: 'admin@test',
  },
];

const demoEnrollmentTokens: GatewayEnrollmentTokenResource[] = [
  {
    id: '018f9c00-0000-7000-8000-0000000000d1',
    gatewayName: 'gw-eu-1',
    singleUse: true,
    expiresAt: '2026-07-16T12:00:00Z',
    createdAt: '2026-07-16T11:00:00Z',
    createdBy: 'admin@test',
  },
];

const demoTrustAnchor: MtlsTrustAnchor = {
  pem: '-----BEGIN CERTIFICATE-----\nMIIBdemoTrustAnchorNotARealCertificate\n-----END CERTIFICATE-----\n',
  fingerprintSha256:
    '3b1f0c9a7d2e4b56890a1c2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f607',
  subject: 'CN=SessionLayer Internal mTLS CA,O=SessionLayer',
  notBefore: '2026-01-01T00:00:00Z',
  notAfter: '2027-01-01T00:00:00Z',
};

const demoSessions: SessionResource[] = [
  {
    id: '018f9c00-0000-7000-8000-0000000000c1',
    identity: 'alice@corp',
    nodeName: 'web-01',
    principal: 'deploy',
    accessModel: 'standing',
    capabilities: ['shell', 'sftp'],
    startedAt: '2026-07-16T10:30:00Z',
  },
  {
    id: '018f9c00-0000-7000-8000-0000000000c2',
    identity: 'bob@corp',
    nodeName: 'db-01',
    principal: 'readonly',
    accessModel: 'jit',
    capabilities: ['shell'],
    startedAt: '2026-07-16T09:00:00Z',
    endedAt: '2026-07-16T09:45:00Z',
    endReason: 'client disconnect',
  },
];

const demoSessionLeases: SessionLeaseResource[] = [
  {
    id: '018f9c00-0000-7000-8000-0000000000e1',
    identity: 'alice@corp',
    sessionId: '018f9c00-0000-7000-8000-0000000000c1',
    gatewayName: 'gw-eu-1',
    acquiredAt: '2026-07-16T10:30:00Z',
    expiresAt: '2026-07-16T18:30:00Z',
    countsTowardCap: true,
  },
];

export const fleetHandlers: RequestHandler[] = [
  http.get(`${CP_BASE_URL}/v1/nodes`, () =>
    HttpResponse.json({ nodes: demoNodes }),
  ),
  http.get(`${CP_BASE_URL}/v1/nodes/:nodeId`, ({ params }) => {
    const node = demoNodes.find((n) => n.id === params.nodeId);
    return node !== undefined
      ? HttpResponse.json(node)
      : HttpResponse.json({ title: 'Not found', status: 404 }, { status: 404 });
  }),
  http.get(`${CP_BASE_URL}/v1/join-tokens`, () =>
    HttpResponse.json({ joinTokens: demoTokens }),
  ),
  http.post(`${CP_BASE_URL}/v1/join-tokens`, async ({ request }) => {
    const body = (await request.json()) as { nodeName: string };
    const issued: IssuedJoinToken = {
      id: '018f9c00-0000-7000-8000-0000000000bf',
      token: 'sl-join-demo-6f3a9c2e0b17',
      nodeName: body.nodeName,
      joinMethod: 'token',
      singleUse: true,
      expiresAt: '2026-07-16T12:00:00Z',
    };
    return HttpResponse.json(issued, { status: 201 });
  }),
  http.get(`${CP_BASE_URL}/v1/gateway-enrollment-tokens`, () =>
    HttpResponse.json({ gatewayEnrollmentTokens: demoEnrollmentTokens }),
  ),
  http.post(
    `${CP_BASE_URL}/v1/gateway-enrollment-tokens`,
    async ({ request }) => {
      const body = (await request.json()) as { gatewayName: string };
      const issued: IssuedGatewayEnrollmentToken = {
        id: '018f9c00-0000-7000-8000-0000000000df',
        token: 'sl-gwenroll-demo-4a7c1e93b806',
        gatewayName: body.gatewayName,
        singleUse: true,
        expiresAt: '2026-07-16T12:00:00Z',
      };
      return HttpResponse.json(issued, { status: 201 });
    },
  ),
  http.get(`${CP_BASE_URL}/v1/cas/mtls/trust-anchor`, () =>
    HttpResponse.json(demoTrustAnchor),
  ),
  http.get(`${CP_BASE_URL}/v1/sessions`, () =>
    HttpResponse.json({ items: demoSessions }),
  ),
  http.get(`${CP_BASE_URL}/v1/sessions/:sessionId`, ({ params }) => {
    const s = demoSessions.find((x) => x.id === params.sessionId);
    return s !== undefined
      ? HttpResponse.json(s)
      : HttpResponse.json({ title: 'Not found', status: 404 }, { status: 404 });
  }),
  http.get(`${CP_BASE_URL}/v1/session-leases`, () =>
    HttpResponse.json({ items: demoSessionLeases }),
  ),
];
