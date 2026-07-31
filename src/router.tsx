import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';

import { CallbackPage } from './auth/CallbackPage';
import { LoginPage } from './auth/LoginPage';
import { buildFeatureRoutes } from './features';
import { OverviewScreen } from './features/overview';
import { AuthedLayout } from './layout/AuthedLayout';
import { NotFound } from './layout/NotFound';
import { RouteError } from './components/RouteError';

// Code-based route tree (no file-based router plugin), so the only generated &
// drift-checked artifact stays the API client. Public routes (`/login`,
// `/auth/callback`) sit at the root; everything else nests under a pathless
// `authed` layout route (guard + shell). Feature screen-groups (Parts B–F) are
// composed in via `buildFeatureRoutes` at integration.
const rootRoute = createRootRoute({ component: () => <Outlet /> });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/callback',
  component: CallbackPage,
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authed',
  component: AuthedLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: OverviewScreen,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  callbackRoute,
  authedRoute.addChildren([indexRoute, ...buildFeatureRoutes(authedRoute)]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
