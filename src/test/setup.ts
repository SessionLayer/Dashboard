import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { clearBearer } from '../auth/tokenStore';
import { server } from './server';

// jsdom's `crypto` implements getRandomValues but NOT `subtle`. The recording
// replay decrypt path (SLREC1 / WebCrypto) and OIDC PKCE need real WebCrypto, so
// install Node's implementation when the environment lacks it.
const g = globalThis as { crypto?: { subtle?: unknown } };
if (g.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

// Fail loudly if a test triggers a Control Plane call we did not mock — an
// unhandled request usually means a real network dependency crept in.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  clearBearer();
  sessionStorage.clear();
  localStorage.clear();
});
afterAll(() => {
  server.close();
});
