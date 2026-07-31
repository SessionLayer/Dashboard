import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { http, HttpResponse, type RequestHandler } from 'msw';

import { CP_BASE_URL } from '../../api/client';
import { AuditScreen } from './AuditScreen';
import { RecordingsScreen } from './RecordingsScreen';
import './observability.css';

/** Registers `/audit-events` and `/recordings` under the authed layout. */
export function createObservabilityRoutes(parent: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: '/audit-events',
      component: AuditScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/recordings',
      component: RecordingsScreen,
    }),
  ];
}

const cp = (path: string) => `${CP_BASE_URL}${path}`;

/**
 * Optional demo/E2E handlers. Real replay decryption needs a customer-sealed
 * object + private key, so these serve only the list surfaces; unit tests install
 * their own handlers with `server.use(...)`.
 */
export const observabilityHandlers: RequestHandler[] = [
  http.get(cp('/v1/recordings'), () => HttpResponse.json({ items: [] })),
  http.get(cp('/v1/audit-events'), () => HttpResponse.json({ items: [] })),
];
