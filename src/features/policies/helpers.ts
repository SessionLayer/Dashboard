import { enumOptions, parseJsonObject } from '../../ui';
import { ProblemError } from '../../api/problem';
import type {
  ConnectorKind,
  BreakglassAuthPath,
  JitApprovalLevel,
} from '../../api/types';

type ApprovalKind = NonNullable<JitApprovalLevel['kind']>;

export const CONNECTOR_OPTIONS = enumOptions<ConnectorKind>({
  agentless: 'agentless',
  agent: 'agent',
});

export const AUTH_PATH_OPTIONS = enumOptions<BreakglassAuthPath>({
  fido2: 'FIDO2 security key',
  offline_code: 'Offline code',
});

export const APPROVAL_KIND_OPTIONS = enumOptions<ApprovalKind>({
  email: 'Email',
  oidc_group: 'OIDC group',
});

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
