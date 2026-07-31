import { expect, test, type Page } from '@playwright/test';

import {
  EXPECTED_MARKER,
  EXPECTED_OUTPUT,
  KEY_PEM,
  SEALED_B64,
  SEALED_SIZE,
} from './replayFixture';

const APP_ORIGIN = 'http://localhost:4173';
const CP_ORIGIN = 'http://localhost:8080'; // the baked-in dev default (loopback)
const IDP_ORIGIN = 'https://idp.example.test'; // playwright.config VITE_OIDC_ISSUER
const OBJECT_STORE_ORIGIN = 'https://objects.example.test';
const OBJECT_URL = `${OBJECT_STORE_ORIGIN}/rec`;

const STRICT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${CP_ORIGIN} ${IDP_ORIGIN} ${OBJECT_STORE_ORIGIN}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

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
    permissions: ['rbac:read', 'audit:read', 'recording:replay'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}

async function enforceCsp(page: Page): Promise<void> {
  await page.route(`${APP_ORIGIN}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': STRICT_CSP },
    });
  });
}

async function captureViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations.push(
        `${e.effectiveDirective || e.violatedDirective} blocked ${e.blockedURI}`,
      );
    });
  });
}

async function readViolations(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
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
  await expect(
    page.getByRole('button', { name: 'Continue with SSO (OIDC)' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue with SSO (OIDC)' }).click();
  await expect(page.getByText('E2E Admin')).toBeVisible();
}

async function stubMeta(page: Page): Promise<void> {
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
      json: { items: [], nodes: [], joinTokens: [], status: 'pass' },
      headers: CORS,
    });
  });
}

test('the app loads and authenticates under the strict production CSP with zero violations', async ({
  page,
}) => {
  await captureViolations(page);
  await enforceCsp(page);
  await stubMeta(page);

  await signIn(page);
  await expect(page.getByRole('link', { name: 'Nodes' })).toBeVisible();

  expect(await readViolations(page)).toEqual([]);
});

test('a recording replays (object-store fetch + WebCrypto decrypt + terminal render) under the strict CSP with zero violations', async ({
  page,
}) => {
  await captureViolations(page);
  await enforceCsp(page);
  await stubMeta(page);

  const recording = {
    id: '11111111-1111-1111-1111-111111111111',
    sessionId: '22222222-2222-2222-2222-222222222222',
    identity: 'alice',
    nodeId: '33333333-3333-3333-3333-333333333333',
    format: 'asciicast-v2',
    status: 'finalized',
    wormMode: 'governance',
    sizeBytes: SEALED_SIZE,
    legalHold: false,
    retentionUntil: '2027-01-01T00:00:00Z',
    startedAt: '2026-07-01T00:00:00Z',
    endedAt: '2026-07-01T00:05:00Z',
    createdAt: '2026-07-01T00:00:00Z',
  };
  await page.route('**/v1/recordings', (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ json: { items: [recording] }, headers: CORS });
  });
  await page.route('**/v1/recordings/*/replay', (route) =>
    route.fulfill({
      json: {
        url: OBJECT_URL,
        method: 'GET',
        expiresAt: '2030-01-01T00:00:00Z',
      },
      headers: CORS,
    }),
  );
  await page.route(OBJECT_URL, (route) =>
    route.fulfill({
      body: Buffer.from(SEALED_B64, 'base64'),
      headers: { ...CORS, 'content-type': 'application/octet-stream' },
    }),
  );

  await signIn(page);
  await page.getByRole('link', { name: 'Recordings' }).first().click();
  await page.getByLabel(/Customer private key/i).setInputFiles({
    name: 'customer.pem',
    mimeType: 'application/x-pem-file',
    buffer: Buffer.from(KEY_PEM),
  });
  await expect(page.getByText('Key loaded')).toBeVisible();
  await page.getByRole('button', { name: 'Replay' }).click();

  await expect(page.getByText(EXPECTED_MARKER)).toBeVisible();
  await page
    .getByRole('slider', { name: 'Seek recording' })
    .evaluate((el, v) => {
      const input = el as HTMLInputElement;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, '999');
  await expect(page.getByText(EXPECTED_OUTPUT)).toBeVisible();

  expect(await readViolations(page)).toEqual([]);
});
