import { describe, expect, it } from 'vitest';

import { makeTestJwt } from '../test/utils';
import { decodeClaims } from './claims';

describe('decodeClaims', () => {
  it('reads subject, name, email, and a permissions-array claim', () => {
    const jwt = makeTestJwt({
      sub: 'admin@corp',
      name: 'Ada',
      email: 'ada@corp',
      permissions: ['rbac:read', 'recording:replay'],
      exp: 2000000000,
    });
    const claims = decodeClaims(jwt);
    expect(claims.subject).toBe('admin@corp');
    expect(claims.name).toBe('Ada');
    expect(claims.email).toBe('ada@corp');
    expect(claims.permissions).toContain('rbac:read');
    expect(claims.permissions).toContain('recording:replay');
    expect(claims.expiresAt).toBe(2000000000);
  });

  it('reads permissions folded into the OAuth scope string', () => {
    const jwt = makeTestJwt({ sub: 's', scope: 'audit:read node:enroll' });
    const claims = decodeClaims(jwt);
    expect(claims.permissions).toEqual(['audit:read', 'node:enroll']);
  });

  it('degrades to empty claims on a malformed token (safe default)', () => {
    expect(decodeClaims('not-a-jwt').permissions).toEqual([]);
    expect(decodeClaims('').subject).toBeUndefined();
  });
});
