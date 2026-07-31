import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/** Shared MSW server intercepting Control Plane calls in unit/component tests. */
export const server = setupServer(...handlers);
