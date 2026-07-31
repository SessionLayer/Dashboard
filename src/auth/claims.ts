import type { PlatformPermission } from '../api/types';

/**
 * Claims the UI reads from the bearer JWT — for display and for RBAC-aware
 * affordances only. The UI is a convenience, NEVER the gate: the Control Plane
 * re-authorizes every mutation server-side (a hidden button is not a security
 * boundary). The signature is therefore intentionally NOT verified here; the CP
 * verifies it. Missing/garbage claims degrade to "no permissions" (safe default).
 */
export interface UserClaims {
  subject: string | undefined;
  name: string | undefined;
  email: string | undefined;
  permissions: PlatformPermission[];
  expiresAt: number | undefined;
  /** OIDC `nonce` claim — bound to the auth request for replay protection. */
  nonce: string | undefined;
}

function base64UrlDecode(segment: string): string {
  const padded = segment
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(segment.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.codePointAt(0) ?? 0);
  return new TextDecoder().decode(bytes);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return value.split(/\s+/).filter((s) => s.length > 0);
  }
  return [];
}

export function decodeClaims(token: string): UserClaims {
  const empty: UserClaims = {
    subject: undefined,
    name: undefined,
    email: undefined,
    permissions: [],
    expiresAt: undefined,
    nonce: undefined,
  };
  const parts = token.split('.');
  if (parts.length < 2 || parts[1] === undefined) return empty;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    return empty;
  }

  // Permissions may arrive as a dedicated `permissions` claim or be folded into
  // OAuth `scope`/`scp`. Both are read; the CP is authoritative regardless.
  const permissions = [
    ...asStringArray(payload.permissions),
    ...asStringArray(payload.scope),
    ...asStringArray(payload.scp),
  ] as PlatformPermission[];

  return {
    subject: typeof payload.sub === 'string' ? payload.sub : undefined,
    name:
      (typeof payload.name === 'string' ? payload.name : undefined) ??
      (typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : undefined),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    permissions: [...new Set(permissions)],
    expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
    nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
  };
}
