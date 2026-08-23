/** An unsigned id_token good enough for the OIDC callback path under test. */
export function testJwt(): string {
  const b64url = (value: object): string =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const payload = {
    sub: 'e2e-admin@corp',
    name: 'E2E Admin',
    permissions: ['rbac:read', 'audit:read', 'recording:replay'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(payload)}.`;
}
