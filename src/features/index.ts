import type { AnyRoute } from '@tanstack/react-router';
import type { RequestHandler } from 'msw';

import { createAccessRoutes, accessHandlers } from './access';
import { createFleetRoutes, fleetHandlers } from './fleet';
import { createIrRoutes, irHandlers } from './ir';
import {
  createObservabilityRoutes,
  observabilityHandlers,
} from './observability';
import { createPoliciesRoutes, policiesHandlers } from './policies';
import { createSettingsRoutes, settingsHandlers } from './settings';
import { overviewHandlers } from './overview';

export function buildFeatureRoutes(parent: AnyRoute): AnyRoute[] {
  return [
    ...createAccessRoutes(parent),
    ...createPoliciesRoutes(parent),
    ...createFleetRoutes(parent),
    ...createIrRoutes(parent),
    ...createObservabilityRoutes(parent),
    ...createSettingsRoutes(parent),
  ];
}

export const featureHandlers: RequestHandler[] = [
  ...accessHandlers,
  ...policiesHandlers,
  ...fleetHandlers,
  ...irHandlers,
  ...observabilityHandlers,
  ...settingsHandlers,
  ...overviewHandlers,
];
