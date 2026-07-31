import { http, HttpResponse, type RequestHandler } from 'msw';

import { CP_BASE_URL } from '../../api/client';
import { OverviewScreen } from './OverviewScreen';

export { OverviewScreen };

const url = (path: string) => `${CP_BASE_URL}${path}`;

/**
 * Optional MSW handlers for the full-app demo/E2E build (the lead wires the
 * component into the index `/` route directly). Unit tests register their own
 * handlers via `server.use(...)`.
 */
export const overviewHandlers: RequestHandler[] = [
  http.get(url('/v1/sessions'), () =>
    HttpResponse.json({
      items: [
        {
          id: '018f0000-0000-7000-8000-000000000001',
          identity: 'alice@corp.example',
          nodeName: 'web-01',
          principal: 'deploy',
          accessModel: 'standing',
          capabilities: ['shell'],
          startedAt: '2026-07-16T09:41:00Z',
        },
        {
          id: '018f0000-0000-7000-8000-000000000002',
          identity: 'bob@corp.example',
          nodeName: 'db-02',
          principal: 'postgres',
          accessModel: 'jit',
          capabilities: ['shell', 'sftp'],
          startedAt: '2026-07-16T10:12:00Z',
        },
      ],
    }),
  ),
  http.get(url('/v1/jit-requests'), () =>
    HttpResponse.json({
      jitRequests: [
        {
          id: '018f0000-0000-7000-8000-0000000000a1',
          requester: 'carol@corp.example',
          targetNodeName: 'db-02',
          principal: 'postgres',
          reason: 'Investigate slow query (INC-4821)',
          state: 'PENDING_APPROVAL',
          requestedAt: '2026-07-16T10:05:00Z',
          approvalDeadline: '2026-07-16T10:35:00Z',
        },
      ],
    }),
  ),
  http.get(url('/v1/locks'), () =>
    HttpResponse.json({
      locks: [
        {
          id: '018f0000-0000-7000-8000-0000000000b1',
          target: { identities: ['mallory@corp.example'] },
          reason: 'Suspected credential compromise',
          createdAt: '2026-07-16T08:50:00Z',
          createdBy: 'secops@corp.example',
        },
      ],
    }),
  ),
  http.get(url('/v1/breakglass/activations'), () =>
    HttpResponse.json({
      activations: [
        {
          id: '018f0000-0000-7000-8000-0000000000c1',
          identity: 'oncall@corp.example',
          principal: 'root',
          reason: 'IdP outage — emergency access (INC-4820)',
          reviewStatus: 'pending',
          activatedAt: '2026-07-16T07:20:00Z',
        },
      ],
    }),
  ),
  http.get(url('/v1/nodes'), () =>
    HttpResponse.json({
      nodes: [
        {
          id: '018f0000-0000-7000-8000-0000000000d1',
          name: 'web-01',
          connectorKind: 'agent',
          status: 'active',
          health: 'healthy',
        },
        {
          id: '018f0000-0000-7000-8000-0000000000d2',
          name: 'db-02',
          connectorKind: 'agentless',
          status: 'active',
          health: 'healthy',
        },
        {
          id: '018f0000-0000-7000-8000-0000000000d3',
          name: 'cache-03',
          connectorKind: 'agent',
          status: 'quarantined',
          health: 'unreachable',
        },
      ],
    }),
  ),
  http.get(url('/v1/audit-events'), () =>
    HttpResponse.json({
      items: [
        {
          id: '018f0000-0000-7000-8000-0000000000e1',
          occurredAt: '2026-07-16T10:12:00Z',
          actor: 'bob@corp.example',
          action: 'session.connect',
          outcome: 'allowed',
          subject: 'db-02',
        },
        {
          id: '018f0000-0000-7000-8000-0000000000e2',
          occurredAt: '2026-07-16T08:50:00Z',
          actor: 'secops@corp.example',
          action: 'lock.create',
          outcome: 'success',
          subject: 'mallory@corp.example',
        },
      ],
    }),
  ),
];
