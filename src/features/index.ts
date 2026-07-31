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

/**
 * Integration seam for the feature screen-groups (Parts B–F). Each area owns its
 * files under `src/features/<area>/` and exports a route factory + MSW handlers;
 * they are composed here so the shared router and test server never need
 * per-feature edits. The overview screen mounts directly on the index route
 * (see router.tsx), so it contributes handlers only.
 */
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
