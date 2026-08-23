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
    permissions: [
      'rbac:read',
      'rbac:write',
      'audit:read',
      'recording:replay',
      'request:approve',
    ],
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

// Superset of every list envelope key across all screens (the same trick
// e2e/smoke.spec.ts uses) - one shared body keeps whichever hook reads it
// happy regardless of which of the ~20 nav destinations actually fired the
// request, so navigating the whole new IA needs no per-screen precision.
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
      json: {
        items: [],
        nodes: [],
        joinTokens: [],
        gatewayEnrollmentTokens: [],
        locks: [],
        activations: [],
        jitRequests: [],
        credentials: [],
        offlineCodes: [],
        pins: [],
      },
      headers: CORS,
    });
  });
  // The operator-settings singleton is not a list, so the shared envelope above
  // cannot stand in for it. Registered last, because Playwright checks routes in
  // reverse order of registration.
  await page.route('**/v1/operator-settings', (route) =>
    route.fulfill({
      json: {
        auditRetentionDays: 365,
        recordingRetentionDays: 180,
        defaultWormMode: 'governance',
        otpTtlSeconds: 120,
        defaultCaBackend: 'local',
        deploymentManagedFields: [],
        recordingKeyConfigured: false,
        recordingKeySealAlgorithm: 'ecies_p256',
        origin: 'default',
        version: 1,
      },
      headers: CORS,
    }),
  );
  await page.route('**/v1/operator-settings/recording-customer-key', (route) =>
    route.fulfill({
      json: { configured: false, sealAlgorithm: 'ecies_p256' },
      headers: CORS,
    }),
  );
}

async function signIn(page: Page): Promise<void> {
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
  await page.route('**/oauth2/token', (route) =>
    route.fulfill({
      json: { id_token: testJwt(), token_type: 'Bearer', expires_in: 3600 },
      headers: CORS,
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with SSO (OIDC)' }).click();
  await expect(page.getByText('E2E Admin')).toBeVisible();
}

test('every top-level nav group is reachable and renders its screen', async ({
  page,
}) => {
  await stubControlPlane(page);
  await signIn(page);

  const stops: { link: string; heading: string }[] = [
    { link: 'Nodes', heading: 'Nodes' },
    { link: 'Sessions', heading: 'Sessions' },
    { link: 'Recordings', heading: 'Recordings' },
    { link: 'Locks', heading: 'Locks' },
    { link: 'JIT requests', heading: 'JIT Access Requests' },
    { link: 'Break-glass', heading: 'Break-glass' },
    { link: 'Rules', heading: 'Data-plane rules' },
    { link: 'Platform roles', heading: 'Platform roles' },
    { link: 'Role bindings', heading: 'Role bindings' },
    { link: 'Certificate authorities', heading: 'Certificate authorities' },
    { link: 'Service accounts', heading: 'Service accounts' },
    { link: 'Join tokens', heading: 'Join tokens' },
    { link: 'Gateway enrollment', heading: 'Gateway enrollment' },
    { link: 'Pins & OTP', heading: 'Pins & OTP' },
    { link: 'Node policies', heading: 'Node policies' },
    { link: 'Capability definitions', heading: 'Capability catalogue' },
    { link: 'JIT policies', heading: 'JIT policies' },
    { link: 'Break-glass policies', heading: 'Break-glass policies' },
    {
      link: 'Session-limit policies',
      heading: 'Session-limit policies',
    },
    { link: 'Operator settings', heading: 'Operator settings' },
    { link: 'Audit log', heading: 'Audit events' },
  ];

  for (const stop of stops) {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: stop.link, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: stop.heading, exact: true }),
    ).toBeVisible();
  }
});

test('operator settings render read-only without settings:write', async ({
  page,
}) => {
  await stubControlPlane(page);
  await signIn(page);

  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Operator settings', exact: true })
    .click();

  await expect(page.getByText(/Read-only view/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(
    0,
  );
  await expect(page.getByLabel(/^Audit retention/)).toBeDisabled();

  await expect(
    page.getByText(/refuses every session until one is set/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Provision key/ })).toHaveCount(
    0,
  );
  await expect(page.getByText('recording:key-manage')).toBeVisible();
});

test('an edit conflicts with a real 409 and surfaces the reload hint', async ({
  page,
}) => {
  await stubControlPlane(page);
  await signIn(page);

  const rule = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'prod-shell',
    identitySelector: { groups: ['sre'] },
    nodeLabelSelector: { env: 'prod' },
    principals: ['root'],
    ttlSeconds: 3600,
    capabilities: ['shell'],
    effect: 'allow',
    origin: 'api',
    version: 5,
  };
  await page.route('**/v1/rules', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ json: { items: [rule] }, headers: CORS });
  });
  await page.route('**/v1/rules/*', (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    return route.fulfill({
      status: 409,
      json: {
        type: 'about:blank',
        title: 'Version conflict',
        status: 409,
        detail: 'The stored version does not match.',
      },
      headers: { ...CORS, 'content-type': 'application/problem+json' },
    });
  });

  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Rules', exact: true })
    .click();
  await page.getByText('prod-shell').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByText('Version conflict')).toBeVisible();
  await expect(page.getByText(/changed since you loaded it/i)).toBeVisible();
});
