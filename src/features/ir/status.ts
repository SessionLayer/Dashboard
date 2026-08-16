import type { BadgeTone } from '../../ui';

export const JIT_STATES = [
  'REQUESTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'ACTIVE',
  'DENIED',
  'EXPIRED',
  'REVOKED',
] as const;

const JIT_TONE: Record<string, BadgeTone> = {
  REQUESTED: 'info',
  PENDING_APPROVAL: 'warn',
  APPROVED: 'pass',
  ACTIVE: 'accent',
  DENIED: 'fail',
  REVOKED: 'fail',
  EXPIRED: 'neutral',
};

export function jitStateTone(state: string): BadgeTone {
  return JIT_TONE[state] ?? 'neutral';
}

const PENDING = new Set(['REQUESTED', 'PENDING_APPROVAL']);
const GRANTED = new Set(['APPROVED', 'ACTIVE']);

export function isPendingJit(state: string): boolean {
  return PENDING.has(state);
}

export function isGrantedJit(state: string): boolean {
  return GRANTED.has(state);
}

export function reviewTone(status: string): BadgeTone {
  return status === 'reviewed' ? 'pass' : 'warn';
}
