/**
 * The rules that make the operator-settings form honest about what it can do,
 * kept out of the component so each one is directly testable.
 *
 * Two classes of field cannot simply be edited:
 *  - *ratcheted* fields move in one direction only, because the other direction
 *    destroys evidence and is reachable solely as the database owner;
 *  - *deployment-managed* fields are reconciled from properties on every boot,
 *    so an API write to one would be silently reverted at the next restart.
 *
 * The Control Plane enforces both with a 422. The UI's job is to say so before
 * the operator submits, rather than letting them compose a change that cannot
 * land.
 */

import { ProblemError } from '../../api/problem';
import type { WormMode } from '../../api/types';

/**
 * Deployment properties that own the session-limit cluster defaults.
 *
 * This list is hard-coded on purpose, and deleting it would cost the operator
 * the only actionable half of the message. The API reports *which* fields are
 * pinned and deliberately does not say by what — the owning property is a
 * Control Plane deployment concern and appears only in the 422 detail — but
 * "this field is pinned" without "by this property" leaves nobody able to act.
 * The names were read from the Control Plane's own `SessionLimitProperties` and
 * `BootstrapService`, not transcribed from elsewhere, and the failure mode if
 * one is ever renamed is bounded by `pinnedBy` below: a pinned field this build
 * cannot name still renders pinned, never writable.
 */
export const DEPLOYMENT_PROPERTIES: Readonly<Record<string, string>> = {
  defaultMaxConcurrentSessions:
    'sessionlayer.session-limits.default-max-concurrent',
  defaultMaxSessionSeconds:
    'sessionlayer.session-limits.default-max-session-seconds',
  defaultIdleTimeoutSeconds:
    'sessionlayer.session-limits.default-idle-timeout-seconds',
};

/** The deployment property pinning `field`, or `undefined` when it is writable. */
export function pinnedBy(
  field: string,
  managedFields: readonly string[] | undefined,
): string | undefined {
  if (managedFields?.includes(field) !== true) return undefined;
  return DEPLOYMENT_PROPERTIES[field] ?? 'a deployment property';
}

export function pinnedReason(property: string): string {
  return `Pinned by deployment configuration (${property}). It is reconciled from that property on every boot, so a write here would be reverted at the next restart — change the property instead.`;
}

/**
 * A retention field may be raised or left alone; lowering it would shorten the
 * window on evidence that already exists, so the API refuses it at any scope.
 */
export function retentionRatchetError(
  current: number | undefined,
  next: number | '',
): string | undefined {
  if (next === '' || current === undefined || next >= current) return undefined;
  return `Retention only increases through the API. It is ${String(current)} days today; lowering it would drop evidence that is currently retained, and that is a database-owner action by design.`;
}

/**
 * `governance` → `compliance` is the strengthening direction and is allowed;
 * the reverse would make new recordings deletable again.
 */
export function wormRatchetError(
  current: WormMode | undefined,
  next: WormMode,
): string | undefined {
  if (current !== 'compliance' || next === 'compliance') return undefined;
  return 'WORM mode only strengthens through the API. Compliance mode makes new recordings undeletable; returning to governance would make them deletable again, and that is a database-owner action by design.';
}

/** WORM modes still reachable from `current` — the ratchet, as options. */
export function wormOptions(
  current: WormMode | undefined,
): readonly { value: WormMode; label: string }[] {
  const compliance = {
    value: 'compliance' as const,
    label:
      'compliance — new recordings cannot be deleted before their retention expires',
  };
  if (current === 'compliance') return [compliance];
  return [
    {
      value: 'governance',
      label: 'governance — a recording:delete holder can delete before expiry',
    },
    compliance,
  ];
}

/**
 * Guidance for an optimistic-concurrency conflict. The singleton has no dialog
 * to reopen: the resource is reloaded in place, which also picks up whatever
 * the other writer changed.
 */
export function conflictHint(error: unknown): string | undefined {
  return error instanceof ProblemError && error.isConflict
    ? 'Someone else changed these settings since this page loaded — reload to pick up their change, then reapply yours.'
    : undefined;
}

/**
 * Mirrors the column's CHECK constraint, so a bad reference is reported as a
 * field error rather than surfacing as a database-level failure.
 */
export function keyRefError(value: string): string | undefined {
  const text = value.trim();
  if (text === '') return undefined;
  if (text.length > 255) return 'At most 255 characters.';
  if (/PRIVATE KEY/i.test(text) || /\bBEGIN [A-Z]/.test(text)) {
    return 'This is a label for the key, not a place to paste key material.';
  }
  return undefined;
}
