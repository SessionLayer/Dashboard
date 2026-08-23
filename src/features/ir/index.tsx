import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { http, HttpResponse, type RequestHandler } from 'msw';

import { BreakGlassScreen } from './BreakGlassScreen';
import { JitRequestList } from './JitRequestList';
import { LockList } from './LockList';
import { PinList } from './PinList';

export function createIrRoutes(parent: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: '/jit-requests',
      component: JitRequestList,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/locks',
      component: LockList,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/break-glass',
      component: BreakGlassScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/pins',
      component: PinList,
    }),
  ];
}

const demoJitRequest = {
  id: '018f0000-0000-7000-8000-000000000001',
  requester: 'dev@corp.example',
  targetNodeName: 'web-01',
  principal: 'deploy',
  reason: 'Ship hotfix',
  state: 'PENDING_APPROVAL',
  jitPolicyName: 'prod-access',
  approvalChain: [{ kind: 'email', value: 'lead@corp.example' }],
  approvals: [],
  requestedAt: '2026-07-16T09:00:00Z',
};

export const irHandlers: RequestHandler[] = [
  http.get('*/v1/jit-requests', () =>
    HttpResponse.json({ jitRequests: [demoJitRequest] }),
  ),
  http.get('*/v1/jit-requests/:id', () => HttpResponse.json(demoJitRequest)),
  http.post('*/v1/jit-requests', () =>
    HttpResponse.json(demoJitRequest, { status: 201 }),
  ),
  http.post('*/v1/jit-requests/:id/approve', () =>
    HttpResponse.json({ ...demoJitRequest, state: 'APPROVED' }),
  ),
  http.post('*/v1/jit-requests/:id/deny', () =>
    HttpResponse.json({ ...demoJitRequest, state: 'DENIED' }),
  ),
  http.post('*/v1/jit-requests/:id/revoke', () =>
    HttpResponse.json({ ...demoJitRequest, state: 'REVOKED' }),
  ),

  http.get('*/v1/locks', () =>
    HttpResponse.json({
      locks: [
        {
          id: '018f0000-0000-7000-8000-0000000000a1',
          target: { identities: ['compromised@corp.example'] },
          reason: 'Suspected credential theft',
          createdAt: '2026-07-16T08:00:00Z',
          createdBy: 'ir@corp.example',
        },
      ],
    }),
  ),
  http.post('*/v1/locks', () =>
    HttpResponse.json(
      {
        id: '018f0000-0000-7000-8000-0000000000a2',
        target: { all: true },
        reason: 'Incident',
        createdAt: '2026-07-16T10:00:00Z',
      },
      { status: 201 },
    ),
  ),
  http.delete('*/v1/locks/:id', () => new HttpResponse(null, { status: 204 })),

  http.get('*/v1/breakglass/activations', () =>
    HttpResponse.json({
      activations: [
        {
          id: '018f0000-0000-7000-8000-0000000000b1',
          identity: 'oncall@corp.example',
          principal: 'root',
          reason: 'Pager: DB down',
          alertRef: 'PD-4821',
          reviewStatus: 'pending',
          activatedAt: '2026-07-16T07:30:00Z',
        },
      ],
    }),
  ),
  http.post('*/v1/breakglass/activations/:id/review', () =>
    HttpResponse.json({
      id: '018f0000-0000-7000-8000-0000000000b1',
      principal: 'root',
      reason: 'Pager: DB down',
      reviewStatus: 'reviewed',
      activatedAt: '2026-07-16T07:30:00Z',
    }),
  ),
  http.get('*/v1/breakglass/credentials', () =>
    HttpResponse.json({ credentials: [] }),
  ),
  http.post('*/v1/breakglass/credentials', () =>
    HttpResponse.json(
      {
        id: '018f0000-0000-7000-8000-0000000000b2',
        keyFingerprint: 'SHA256:demo',
        identity: 'oncall@corp.example',
        allowedPrincipals: ['root'],
        createdAt: '2026-07-16T10:00:00Z',
      },
      { status: 201 },
    ),
  ),
  http.delete(
    '*/v1/breakglass/credentials/:id',
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get('*/v1/breakglass/offline-codes', () =>
    HttpResponse.json({ offlineCodes: [] }),
  ),
  http.post('*/v1/breakglass/offline-codes', () =>
    HttpResponse.json(
      {
        ids: ['018f0000-0000-7000-8000-0000000000c1'],
        codes: ['DEMO-CODE-0001'],
        expiresAt: '2026-10-14T00:00:00Z',
      },
      { status: 201 },
    ),
  ),

  http.get('*/v1/pins', () => HttpResponse.json({ pins: [] })),
  http.post('*/v1/pins', () =>
    HttpResponse.json(
      {
        id: '018f0000-0000-7000-8000-0000000000d1',
        fingerprint: 'SHA256:demo',
        identity: 'dev@corp.example',
        principals: ['deploy'],
        expiresAt: '2026-07-16T18:00:00Z',
      },
      { status: 201 },
    ),
  ),
  http.delete('*/v1/pins/:id', () => new HttpResponse(null, { status: 204 })),

  http.post('*/v1/otp', () =>
    HttpResponse.json(
      {
        otpId: '018f0000-0000-7000-8000-0000000000e1',
        otp: '482913',
        expiresAt: '2026-07-16T18:05:00Z',
      },
      { status: 201 },
    ),
  ),
];
