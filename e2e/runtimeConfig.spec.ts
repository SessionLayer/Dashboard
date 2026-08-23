import { expect, test } from '@playwright/test';

import { testJwt } from './authFixture';

// The bundle under test was built with VITE_CP_BASE_URL=http://localhost:8080
// and VITE_OIDC_ISSUER=https://idp.example.test (playwright.config.ts). A
// container serves /config.js from its own environment instead, so these serve
// one and watch the app use it - the repointing claim, in a real browser.
const APP_ORIGIN = 'http://localhost:4173';
const SERVED_CP = 'http://127.0.0.1:8080';
const SERVED_IDP = 'https://idp.served.test';
const BAKED_CP = 'http://localhost:8080';
const CORS = { 'access-control-allow-origin': '*' };

test('the endpoints the container serves win over the ones the build baked', async ({
  page,
}) => {
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.__SL_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify({
        CP_BASE_URL: SERVED_CP,
        OIDC_ISSUER: SERVED_IDP,
        OIDC_CLIENT_ID: 'served-client',
      })});`,
    }),
  );

  const servedCalls: string[] = [];
  const bakedCalls: string[] = [];
  const stub =
    (seen: string[]) => (route: import('@playwright/test').Route) => {
      seen.push(route.request().url());
      return route.fulfill({
        json: {
          component: 'SessionLayer Control Plane',
          version: '0.1.0',
          protocols: {
            controlPlaneGatewayGrpc: { min: '1.0', max: '1.0' },
            agentGatewayWire: { min: '1.0', max: '1.0' },
          },
          items: [],
          nodes: [],
          status: 'pass',
        },
        headers: CORS,
      });
    };
  await page.route(`${SERVED_CP}/v1/**`, stub(servedCalls));
  await page.route(`${BAKED_CP}/v1/**`, stub(bakedCalls));

  let authorize = '';
  await page.route('**/authorize?*', (route) => {
    authorize = route.request().url();
    const state = new URL(authorize).searchParams.get('state') ?? '';
    return route.fulfill({
      status: 302,
      headers: {
        location: `${APP_ORIGIN}/auth/callback?code=fake-auth-code&state=${state}`,
      },
    });
  });
  let token = '';
  await page.route('**/oauth2/token', (route) => {
    token = route.request().url();
    return route.fulfill({
      json: { id_token: testJwt(), token_type: 'Bearer', expires_in: 3600 },
      headers: CORS,
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with SSO (OIDC)' }).click();
  await expect(page.getByText('E2E Admin')).toBeVisible();
  await expect(page.getByTestId('sidebar-cp-version')).toContainText('0.1.0');

  expect(new URL(authorize).origin).toBe(SERVED_IDP);
  expect(new URL(authorize).searchParams.get('client_id')).toBe(
    'served-client',
  );
  expect(new URL(token).origin).toBe(SERVED_IDP);
  expect(servedCalls.length).toBeGreaterThan(0);
  expect(bakedCalls).toEqual([]);
});

test('a cleartext endpoint from the environment refuses to render the app', async ({
  page,
}) => {
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.__SL_RUNTIME_CONFIG__ = Object.freeze({"CP_BASE_URL":"http://cp.insecure.example"});`,
    }),
  );

  await page.goto('/');
  await expect(page.locator('.startup-failure')).toContainText(
    'SL_CP_BASE_URL must be https://',
  );
  await expect(
    page.getByRole('button', { name: 'Continue with SSO (OIDC)' }),
  ).toHaveCount(0);
});
