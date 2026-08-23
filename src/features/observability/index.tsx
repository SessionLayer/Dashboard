import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { http, HttpResponse, type RequestHandler } from 'msw';

import { CP_BASE_URL } from '../../api/client';
import { AuditScreen } from './AuditScreen';
import { RecordingsScreen } from './RecordingsScreen';
import './observability.css';

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

export const observabilityHandlers: RequestHandler[] = [
  http.get(cp('/v1/recordings'), () => HttpResponse.json({ items: [] })),
  http.get(cp('/v1/audit-events'), () => HttpResponse.json({ items: [] })),
];
