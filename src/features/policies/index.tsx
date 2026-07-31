import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { http, HttpResponse, type RequestHandler } from 'msw';

import { CP_BASE_URL } from '../../api/client';
import type {
  CapabilityDefResource,
  JitPolicyResource,
  BreakglassPolicyResource,
  NodePolicyResource,
  SessionLimitPolicyResource,
} from '../../api/types';
import { CapabilityDefsScreen } from './CapabilityDefsScreen';
import { JitPoliciesScreen } from './JitPoliciesScreen';
import { BreakglassPoliciesScreen } from './BreakglassPoliciesScreen';
import { NodePoliciesScreen } from './NodePoliciesScreen';
import { SessionLimitPoliciesScreen } from './SessionLimitPoliciesScreen';

/** The five config-policy routes, wired centrally by the shared router. */
export function createPoliciesRoutes(parent: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: '/capability-defs',
      component: CapabilityDefsScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/jit-policies',
      component: JitPoliciesScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/breakglass-policies',
      component: BreakglassPoliciesScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/node-policies',
      component: NodePoliciesScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/session-limit-policies',
      component: SessionLimitPoliciesScreen,
    }),
  ];
}

const cp = (path: string) => `${CP_BASE_URL}${path}`;

const demoCapabilityDefs: CapabilityDefResource[] = [
  {
    id: '018f0000-0000-7000-8000-0000000000c1',
    name: 'shell',
    description: 'Interactive shell.',
    origin: 'default',
    version: 1,
  },
  {
    id: '018f0000-0000-7000-8000-0000000000c2',
    name: 'sftp',
    description: 'File transfer.',
    origin: 'ui',
    version: 2,
  },
];

const demoJitPolicies: JitPolicyResource[] = [
  {
    id: '018f0000-0000-7000-8000-0000000000f1',
    name: 'prod-oncall',
    targetSelector: { env: 'prod' },
    capabilities: ['shell', 'exec'],
    maxTtlSeconds: 3600,
    approvalChain: [{ kind: 'oidc_group', value: 'sre-leads' }],
    origin: 'api',
    version: 3,
  },
];

const demoBreakglassPolicies: BreakglassPolicyResource[] = [
  {
    id: '018f0000-0000-7000-8000-0000000000b1',
    name: 'emergency',
    recordingStrict: true,
    alertTarget: '#security-alerts',
    reviewRequired: true,
    authPath: 'fido2',
    origin: 'default',
    version: 1,
  },
];

const demoNodePolicies: NodePolicyResource[] = [
  {
    id: '018f0000-0000-7000-8000-0000000000e1',
    name: 'default-agentless',
    desiredLabels: { tier: 'edge' },
    connectorKind: 'agentless',
    origin: 'ui',
    version: 1,
  },
];

const demoSessionLimitPolicies: SessionLimitPolicyResource[] = [
  {
    id: '018f0000-0000-7000-8000-0000000000d1',
    name: 'sre-oncall-cap',
    identitySelector: { team: 'sre' },
    maxConcurrentSessions: 3,
    maxSessionSeconds: 28800,
    origin: 'api',
    version: 1,
  },
];

/**
 * Optional demo/E2E handlers so the full app renders content without a live
 * Control Plane. Unit tests define their own handlers via `server.use(...)`.
 */
export const policiesHandlers: RequestHandler[] = [
  http.get(cp('/v1/capability-defs'), () =>
    HttpResponse.json({ items: demoCapabilityDefs }),
  ),
  http.get(cp('/v1/jit-policies'), () =>
    HttpResponse.json({ items: demoJitPolicies }),
  ),
  http.get(cp('/v1/breakglass-policies'), () =>
    HttpResponse.json({ items: demoBreakglassPolicies }),
  ),
  http.get(cp('/v1/node-policies'), () =>
    HttpResponse.json({ items: demoNodePolicies }),
  ),
  http.get(cp('/v1/session-limit-policies'), () =>
    HttpResponse.json({ items: demoSessionLimitPolicies }),
  ),
];
