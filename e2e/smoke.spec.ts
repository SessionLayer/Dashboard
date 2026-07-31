import { expect, test, type Page } from '@playwright/test';

const APP_ORIGIN = 'http://localhost:4173';

const CORS = { 'access-control-allow-origin': '*' };

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function testJwt(): string {
  const payload = {
    sub: 'e2e-admin@corp',
    name: 'E2E Admin',
    permissions: ['rbac:read', 'rbac:write', 'audit:read', 'recording:replay'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

async function stubControlPlane(page: Page): Promise<void> {
  await page.route('**/v1/healthz', (route) =>
    route.fulfill({ json: { status: 'pass' }, headers: CORS }),
  );
  await page.route('**/v1/version', (route) =>
    route.fulfill({
      json: {
        component: 'SessionLayer Control Plane',
        version: '0.1.0',
        protocols: {
          controlPlaneGatewayGrpc: { min: '1.0', max: '1.0' },
          agentGatewayWire: { min: '1.0', max: '1.0' },
        },
      },
      headers: CORS,
    }),
  );
  await page.route('**/v1/**', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      json: { items: [], nodes: [], joinTokens: [] },
      headers: CORS,
    });
  });
}

test('unauthenticated visitors are sent to the sign-in screen', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Control Plane/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue with SSO (OIDC)' }),
  ).toBeVisible();
});

test('OIDC authorization-code + PKCE flow yields an in-memory bearer', async ({
  page,
}) => {
  await stubControlPlane(page);

  // Mock the IdP: the authorize redirect bounces back to /auth/callback echoing
  // the PKCE `state`; the token endpoint returns the ID token.
  await page.route('**/authorize?*', (route) => {
    const state =
      new URL(route.request().url()).searchParams.get('state') ?? '';
    return route.fulfill({
      status: 302,
      headers: {
        location: `${APP_ORIGIN}/auth/callback?code=fake-auth-code&state=${state}`,
      },
    });
  });
  const jwt = testJwt();
  await page.route('**/oauth2/token', (route) =>
    route.fulfill({
      json: { id_token: jwt, token_type: 'Bearer', expires_in: 3600 },
      headers: CORS,
    }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with SSO (OIDC)' }).click();

  await expect(page.getByText('E2E Admin')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nodes' })).toBeVisible();

  const storage = await page.evaluate(() => ({
    ls: JSON.stringify(window.localStorage),
    ss: JSON.stringify(window.sessionStorage),
  }));
  expect(storage.ls).not.toContain(jwt);
  expect(storage.ss).not.toContain(jwt);
  expect(storage.ls).not.toContain('id_token');
});
