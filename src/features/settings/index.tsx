import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { http, HttpResponse, type RequestHandler } from 'msw';

import { CP_BASE_URL } from '../../api/client';
import type { OperatorSettings, RecordingCustomerKey } from '../../api/types';
import { OperatorSettingsScreen } from './OperatorSettingsScreen';

/** The operator-settings singleton: one path, no collection. */
export function createSettingsRoutes(parent: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: '/operator-settings',
      component: OperatorSettingsScreen,
    }),
  ];
}

const cp = (path: string) => `${CP_BASE_URL}${path}`;

const demoSettings: OperatorSettings = {
  auditRetentionDays: 365,
  recordingRetentionDays: 365,
  defaultWormMode: 'governance',
  otpTtlSeconds: 120,
  defaultCaBackend: 'local',
  defaultMaxConcurrentSessions: 5,
  deploymentManagedFields: [],
  recordingKeyConfigured: false,
  recordingKeySealAlgorithm: 'ecies_p256',
  origin: 'default',
  version: 1,
};

const demoKey: RecordingCustomerKey = {
  configured: false,
  sealAlgorithm: 'ecies_p256',
};

/**
 * Optional demo/E2E handlers so the full app renders content without a live
 * Control Plane. Unit tests define their own handlers via `server.use(...)`.
 */
export const settingsHandlers: RequestHandler[] = [
  http.get(cp('/v1/operator-settings'), () => HttpResponse.json(demoSettings)),
  http.get(cp('/v1/operator-settings/recording-customer-key'), () =>
    HttpResponse.json(demoKey),
  ),
];
