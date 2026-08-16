import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { http, HttpResponse, type RequestHandler } from 'msw';

import { CP_BASE_URL } from '../../api/client';
import type {
  CaKind,
  CaPublicKey,
  CaResource,
  RoleBindingResource,
  RoleResource,
  RuleResource,
  ServiceAccountResource,
} from '../../api/types';
import { CasScreen } from './CasScreen';
import { RoleBindingsScreen } from './RoleBindingsScreen';
import { RolesScreen } from './RolesScreen';
import { RulesScreen } from './RulesScreen';
import { ServiceAccountsScreen } from './ServiceAccountsScreen';

export function createAccessRoutes(parent: AnyRoute): AnyRoute[] {
  return [
    createRoute({
      getParentRoute: () => parent,
      path: '/rules',
      component: RulesScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/roles',
      component: RolesScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/role-bindings',
      component: RoleBindingsScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/service-accounts',
      component: ServiceAccountsScreen,
    }),
    createRoute({
      getParentRoute: () => parent,
      path: '/cas',
      component: CasScreen,
    }),
  ];
}

const u = (n: number): string =>
  `00000000-0000-0000-0000-0000000000${String(n).padStart(2, '0')}`;

const demoRule: RuleResource = {
  id: u(1),
  name: 'admins-prod-shell',
  identitySelector: { groups: ['sre'] },
  nodeLabelSelector: { env: 'prod' },
  principals: ['root', 'deploy'],
  ttlSeconds: 3600,
  capabilities: ['shell', 'exec'],
  effect: 'allow',
  origin: 'api',
  version: 1,
};

const demoRole: RoleResource = {
  id: u(2),
  name: 'platform-admin',
  permissions: ['rbac:read', 'rbac:write', 'ca:manage'],
  description: 'Full platform administration.',
  origin: 'default',
  version: 1,
};

const demoRoleBinding: RoleBindingResource = {
  id: u(3),
  roleId: u(2),
  subjectKind: 'group',
  subject: 'platform-admins',
  origin: 'api',
  version: 1,
};

const demoCa: CaResource = {
  id: u(4),
  name: 'user-ca',
  caKind: 'user',
  backend: 'aws_kms',
  keyReference: 'arn:aws:kms:us-east-1:acct:key/abc',
  algorithm: 'ecdsa-p256',
  rotationState: 'active',
  origin: 'default',
  version: 1,
};

const demoCaPublicKey: CaPublicKey = {
  caKind: 'session',
  algorithm: 'ecdsa-p256',
  rotationState: 'active',
  publicKeySpkiDer:
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE9gAjXBubG6rVrDkl3jQdd2dgR8Mb6MrtwRqfNqWns4Ps9JbpOG4yvBZ56RD6f4kZa6MOhv5QjUcyFGdNc/aUCA==',
  opensshPublicKey:
    'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBPYAI1wbmxuq1aw5Jd40HXdnYEfDG+jK7cEanzalp7OD7PSW6ThuMrwWeekQ+n+JGWujDob+UI1HMhRnTXP2lAg= sessionlayer-session-ca',
  fingerprint: 'SHA256:l0aBc9mQ1e2Zx7pQwErTyUiOpAsDfGhJkLzXcVbNm10',
};

const demoServiceAccount: ServiceAccountResource = {
  id: u(5),
  name: 'ci-deployer',
  description: 'CI/CD pipeline consumer.',
  authMethod: 'private_key_jwt',
  keyReference: 'https://ci.example/.well-known/jwks.json',
  tokenTtlSeconds: 900,
  origin: 'api',
  version: 1,
};

const url = (path: string): string => `${CP_BASE_URL}${path}`;
const created =
  (status = 201) =>
  () =>
    HttpResponse.json({}, { status });

export const accessHandlers: RequestHandler[] = [
  http.get(url('/v1/rules'), () => HttpResponse.json({ items: [demoRule] })),
  http.post(url('/v1/rules'), created()),
  http.put(url('/v1/rules/:ruleId'), () => HttpResponse.json(demoRule)),
  http.delete(url('/v1/rules/:ruleId'), created(204)),

  http.get(url('/v1/roles'), () => HttpResponse.json({ items: [demoRole] })),
  http.post(url('/v1/roles'), created()),
  http.put(url('/v1/roles/:roleId'), () => HttpResponse.json(demoRole)),
  http.delete(url('/v1/roles/:roleId'), created(204)),

  http.get(url('/v1/role-bindings'), () =>
    HttpResponse.json({ items: [demoRoleBinding] }),
  ),
  http.post(url('/v1/role-bindings'), created()),
  http.put(url('/v1/role-bindings/:bindingId'), () =>
    HttpResponse.json(demoRoleBinding),
  ),
  http.delete(url('/v1/role-bindings/:bindingId'), created(204)),

  http.get(url('/v1/cas'), () => HttpResponse.json({ items: [demoCa] })),
  http.post(url('/v1/cas'), created()),
  http.put(url('/v1/cas/:caId'), () => HttpResponse.json(demoCa)),
  http.delete(url('/v1/cas/:caId'), created(204)),
  http.post(url('/v1/cas/:caId/rotate'), () => HttpResponse.json(demoCa)),
  http.get(url('/v1/cas/:caKind/public-key'), ({ params }) =>
    HttpResponse.json({
      ...demoCaPublicKey,
      caKind: params.caKind as CaKind,
    }),
  ),

  http.get(url('/v1/service-accounts'), () =>
    HttpResponse.json({ items: [demoServiceAccount] }),
  ),
  http.post(url('/v1/service-accounts'), created()),
  http.put(url('/v1/service-accounts/:serviceAccountId'), () =>
    HttpResponse.json(demoServiceAccount),
  ),
  http.delete(url('/v1/service-accounts/:serviceAccountId'), created(204)),
  http.post(url('/v1/service-accounts/:serviceAccountId/credentials'), () =>
    HttpResponse.json(
      {
        id: u(6),
        serviceAccountId: u(5),
        credentialType: 'client_secret',
        clientSecret: 'demo-secret-shown-once',
        status: 'active',
        issuedAt: new Date().toISOString(),
      },
      { status: 201 },
    ),
  ),
  http.delete(
    url('/v1/service-accounts/:serviceAccountId/credentials/:credentialId'),
    created(204),
  ),
];
