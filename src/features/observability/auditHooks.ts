import { api } from '../../api/client';
import {
  resourceKey,
  useCursorList,
  type CursorListResult,
} from '../../api/http';
import { unwrap } from '../../api/problem';
import type {
  AccessModel,
  AuditEventResource,
  Capability,
} from '../../api/types';

/** All the search dimensions the `/v1/audit-events` contract accepts (FR-AUD-8/9). */
export interface AuditFilters {
  actor?: string;
  subject?: string;
  action?: string;
  outcome?: string;
  sessionId?: string;
  nodeId?: string;
  sourceIp?: string;
  from?: string;
  to?: string;
  capability?: Capability | '';
  accessModel?: AccessModel | '';
  nodeLabel?: string[];
  correlationId?: string;
}

type AuditQuery = Omit<AuditFilters, 'capability' | 'accessModel'> & {
  capability?: Capability;
  accessModel?: AccessModel;
};

/** RFC-3339-ise a `datetime-local` value; leave anything else untouched. */
function toRfc3339(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

export function cleanAuditFilters(f: AuditFilters): AuditQuery {
  const out: AuditQuery = {};
  if (f.actor) out.actor = f.actor;
  if (f.subject) out.subject = f.subject;
  if (f.action) out.action = f.action;
  if (f.outcome) out.outcome = f.outcome;
  if (f.sessionId) out.sessionId = f.sessionId;
  if (f.nodeId) out.nodeId = f.nodeId;
  if (f.sourceIp) out.sourceIp = f.sourceIp;
  const from = toRfc3339(f.from);
  if (from) out.from = from;
  const to = toRfc3339(f.to);
  if (to) out.to = to;
  if (f.capability) out.capability = f.capability;
  if (f.accessModel) out.accessModel = f.accessModel;
  if (f.nodeLabel && f.nodeLabel.length > 0) out.nodeLabel = f.nodeLabel;
  if (f.correlationId) out.correlationId = f.correlationId;
  return out;
}

export function useAuditEvents(
  filters: AuditFilters,
  options?: { enabled?: boolean },
): CursorListResult<AuditEventResource> {
  const query = cleanAuditFilters(filters);
  return useCursorList(
    resourceKey('audit-events', query),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/audit-events', {
          params: { query: { cursor, ...query } },
          signal,
        }),
      ),
    options,
  );
}
