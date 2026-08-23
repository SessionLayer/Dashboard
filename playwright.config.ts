import { defineConfig, devices } from '@playwright/test';

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
  webServer: {
    command: 'npm run build && npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Baked, because `vite preview` serves dist/ with the empty placeholder
    // config.js - there is no container here to write one. e2e/runtimeConfig.spec.ts
    // serves its own to prove the runtime path overrides these.
    env: {
      ...process.env,
      VITE_CP_BASE_URL: 'http://localhost:8080',
      VITE_OIDC_ISSUER: 'https://idp.example.test',
      VITE_OIDC_CLIENT_ID: 'sessionlayer-dashboard-e2e',
    },
  },
});
