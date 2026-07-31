import { defineConfig, devices } from '@playwright/test';

// Single headless smoke against the built artifact. The Control Plane is NOT
// live: the spec intercepts `GET /v1/version` at the network layer
// (page.route) so the smoke needs no backend. See e2e/smoke.spec.ts.
const PORT = 4173;
const BASE_URL = `http://localhost:${String(PORT)}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Serve the production build, mirroring what we actually ship. The build runs
  // here too so `npm run test:e2e` is self-contained; in the gate it runs after
  // `npm run build`, and locally an already-running preview is reused. The OIDC
  // vars are baked in so the auth-flow smoke can drive a route-mocked IdP.
  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      VITE_OIDC_ISSUER: 'https://idp.example.test',
      VITE_OIDC_CLIENT_ID: 'sessionlayer-dashboard-e2e',
    },
  },
});
