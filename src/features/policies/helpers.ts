import { parseJsonObject } from '../../ui';
import { ProblemError } from '../../api/problem';
import type {
  Capability,
  ConnectorKind,
  BreakglassAuthPath,
  JitApprovalLevel,
} from '../../api/types';

type ApprovalKind = NonNullable<JitApprovalLevel['kind']>;

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

export const CONNECTOR_OPTIONS: readonly {
  value: ConnectorKind;
  label: string;
}[] = [
  { value: 'agentless', label: 'agentless' },
  { value: 'agent', label: 'agent' },
];

export const AUTH_PATH_OPTIONS: readonly {
  value: BreakglassAuthPath;
  label: string;
}[] = [
  { value: 'fido2', label: 'FIDO2 security key' },
  { value: 'offline_code', label: 'Offline code' },
];

export const APPROVAL_KIND_OPTIONS: readonly {
  value: ApprovalKind;
  label: string;
}[] = [
  { value: 'email', label: 'Email' },
  { value: 'oidc_group', label: 'OIDC group' },
];

/** Guidance for an optimistic-concurrency conflict (stale `version`) on a save. */
export function conflictHint(error: unknown): string | undefined {
  return error instanceof ProblemError && error.isConflict
    ? 'This record changed since you opened it — close and reopen to load the latest, then retry.'
    : undefined;
}

export interface JsonState {
  ok: boolean;
  value: Record<string, unknown> | undefined;
}

/** Parse a JSON-object editor's text, distinguishing empty (omit) from invalid. */
export function parseJsonState(text: string): JsonState {
  try {
    return { ok: true, value: parseJsonObject(text) };
  } catch {
    return { ok: false, value: undefined };
  }
}

/** Pretty-print an object for a JSON editor, or empty string for none. */
export function toJsonText(value: Record<string, unknown> | undefined): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}
