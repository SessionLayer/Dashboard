import type { BadgeTone } from '../../ui';
import type { Capability } from '../../api/types';

/** JIT state-machine values (Design §7); the API sends these as a plain string. */
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

/** A request awaiting a decision — approve/deny are candidate actions. */
export function isPendingJit(state: string): boolean {
  return PENDING.has(state);
}

/** A live/approved grant — revoke is a candidate action. */
export function isGrantedJit(state: string): boolean {
  return GRANTED.has(state);
}

export function reviewTone(status: string): BadgeTone {
  return status === 'reviewed' ? 'pass' : 'warn';
}

export const CAPABILITY_OPTIONS: readonly {
  value: Capability;
  label: string;
}[] = [
  { value: 'shell', label: 'shell' },
  { value: 'exec', label: 'exec' },
  { value: 'sftp', label: 'sftp' },
  { value: 'scp', label: 'scp' },
  { value: 'port_forward_local', label: 'port_forward_local' },
  { value: 'port_forward_remote', label: 'port_forward_remote' },
  { value: 'agent_forward', label: 'agent_forward' },
  { value: 'x11', label: 'x11' },
];
