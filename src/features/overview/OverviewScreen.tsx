import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useId, useState, type ReactNode } from 'react';

import { healthQueryOptions, versionQueryOptions } from '../../api/queries';
import type {
  AccessModel,
  AuditEventResource,
  BreakglassActivationResource,
  HealthStatus,
  JitRequestResource,
  LockResource,
  LockTarget,
  NodeResource,
  SessionResource,
} from '../../api/types';
import { useAuth, useCan } from '../../auth/AuthContext';
import {
  AsyncList,
  Badge,
  type BadgeTone,
  Button,
  type Column,
  DataTable,
  Detail,
  DetailList,
  PageHeader,
  ProblemAlert,
  Time,
  enumMembers,
} from '../../ui';
import { JitDecisionDialog, type DecisionKind } from '../ir/JitRequestList';
import { isPendingJit } from '../ir/status';
import {
  useActiveLocks,
  useActiveSessions,
  useBreakglassActivations,
  useNodes,
  usePendingJit,
  useRecentAudit,
} from './queries';
import './overview.css';

const RECENT = 6;

export function OverviewScreen() {
  const navigate = useNavigate();
  const sessions = useActiveSessions();
  const jit = usePendingJit();
  const locks = useActiveLocks();
  const breakglass = useBreakglassActivations();
  const nodes = useNodes();
  const audit = useRecentAudit();
  const canApprove = useCan('request:approve');
  const subject = useAuth().user?.subject;
  const [decision, setDecision] = useState<{
    kind: DecisionKind;
    row: JitRequestResource;
  } | null>(null);

  const sessionItems = sessions.data?.items ?? [];
  const bgItems = breakglass.data ?? [];
  const nodeItems = nodes.data ?? [];
  const unreviewedBg = bgItems.filter(
    (a) => a.reviewStatus === 'pending',
  ).length;
  const quarantinedNodes = nodeItems.filter(
    (n) => n.status === 'quarantined',
  ).length;
  const attentionNodes = nodeItems.filter(
    (n) =>
      n.health === 'unhealthy' ||
      n.health === 'unreachable' ||
      n.status === 'quarantined',
  ).length;
  const hasAlerts = unreviewedBg > 0 || quarantinedNodes > 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Live control-plane posture: active access, pending approvals, and incident signals."
      />
      <div className="overview">
        {hasAlerts && (
          <div className="overview-alerts">
            {unreviewedBg > 0 && (
              <AlertBanner
                tone="fail"
                text={`${String(unreviewedBg)} break-glass activation${unreviewedBg > 1 ? 's' : ''} awaiting mandatory review`}
                cta="Review"
                onActivate={() => {
                  void navigate({ to: '/break-glass' });
                }}
              />
            )}
            {quarantinedNodes > 0 && (
              <AlertBanner
                tone="warn"
                text={`${String(quarantinedNodes)} node${quarantinedNodes > 1 ? 's' : ''} quarantined`}
                cta="Inspect"
                onActivate={() => {
                  void navigate({ to: '/nodes' });
                }}
              />
            )}
          </div>
        )}

        <section className="card-grid" aria-label="Key metrics">
          <Kpi
            label="Active sessions"
            value={sessionItems.length}
            plus={sessions.data?.hasMore ?? false}
            isPending={sessions.isPending}
            isError={sessions.isError}
            onActivate={() => {
              void navigate({ to: '/sessions' });
            }}
          />
          <Kpi
            label="Pending JIT approvals"
            value={jit.data?.length ?? 0}
            isPending={jit.isPending}
            isError={jit.isError}
            tone="warn"
            onActivate={() => {
              void navigate({ to: '/jit-requests' });
            }}
          />
          <Kpi
            label="Active locks"
            value={locks.data?.length ?? 0}
            isPending={locks.isPending}
            isError={locks.isError}
            tone="warn"
            onActivate={() => {
              void navigate({ to: '/locks' });
            }}
          />
          <Kpi
            label="Break-glass to review"
            value={unreviewedBg}
            isPending={breakglass.isPending}
            isError={breakglass.isError}
            tone="fail"
            onActivate={() => {
              void navigate({ to: '/break-glass' });
            }}
          />
          <Kpi
            label="Nodes"
            value={nodeItems.length}
            isPending={nodes.isPending}
            isError={nodes.isError}
            onActivate={() => {
              void navigate({ to: '/nodes' });
            }}
          />
          <Kpi
            label="Nodes needing attention"
            value={attentionNodes}
            isPending={nodes.isPending}
            isError={nodes.isError}
            tone="fail"
            onActivate={() => {
              void navigate({ to: '/nodes' });
            }}
          />
        </section>

        <Section title="Active sessions">
          <RecentTable
            rows={sessionItems}
            isPending={sessions.isPending}
            isError={sessions.isError}
            error={sessions.error}
            emptyTitle="No active sessions"
            caption="Most recent active SSH sessions"
            rowKey={(r) => r.id}
            columns={SESSION_COLUMNS}
          />
        </Section>

        <Section title="Pending JIT approvals">
          <RecentTable
            rows={jit.data ?? []}
            isPending={jit.isPending}
            isError={jit.isError}
            error={jit.error}
            emptyTitle="No requests awaiting approval"
            caption="JIT requests awaiting an approval decision"
            rowKey={(r) => r.id}
            columns={jitColumns(canApprove, subject, setDecision)}
          />
        </Section>

        <Section title="Incident response">
          <div className="overview-2col">
            <div className="overview-subpanel">
              <h3 className="overview-subtitle">Active locks</h3>
              <RecentTable
                rows={locks.data ?? []}
                isPending={locks.isPending}
                isError={locks.isError}
                error={locks.error}
                emptyTitle="No active locks"
                caption="Currently enforced access locks"
                rowKey={(r) => r.id}
                columns={LOCK_COLUMNS}
              />
            </div>
            <div className="overview-subpanel">
              <h3 className="overview-subtitle">Recent break-glass</h3>
              <RecentTable
                rows={bgItems}
                isPending={breakglass.isPending}
                isError={breakglass.isError}
                error={breakglass.error}
                emptyTitle="No break-glass activations"
                caption="Recent break-glass activations"
                rowKey={(r) => r.id}
                columns={BREAKGLASS_COLUMNS}
              />
            </div>
          </div>
        </Section>

        <Section title="Node health">
          <AsyncList
            isPending={nodes.isPending}
            isError={nodes.isError}
            error={nodes.error}
            isEmpty={nodeItems.length === 0}
            emptyTitle="No nodes registered"
          >
            <NodeHealthView nodes={nodeItems} />
          </AsyncList>
        </Section>

        <Section title="Recent audit events">
          <RecentTable
            rows={audit.data ?? []}
            isPending={audit.isPending}
            isError={audit.isError}
            error={audit.error}
            emptyTitle="No audit events"
            caption="Most recent audit events, newest first"
            rowKey={(r) => r.id}
            columns={AUDIT_COLUMNS}
            limit={8}
          />
        </Section>

        <ControlPlaneSection />
      </div>

      {decision !== null && (
        <JitDecisionDialog
          kind={decision.kind}
          request={decision.row}
          onClose={() => {
            setDecision(null);
          }}
        />
      )}
    </>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="overview-section" aria-labelledby={id}>
      <div className="overview-section-head">
        <h2 className="overview-section-title" id={id}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  isPending,
  isError,
  tone,
  plus = false,
  onActivate,
}: {
  label: string;
  value: number;
  isPending: boolean;
  isError: boolean;
  tone?: 'warn' | 'fail';
  plus?: boolean;
  onActivate: () => void;
}) {
  const emphasize = tone !== undefined && !isPending && !isError && value > 0;
  return (
    <button type="button" className="metric-card" onClick={onActivate}>
      <div className={`metric-value${emphasize ? ` tone-${tone}` : ''}`}>
        {isPending ? (
          <span className="muted">—</span>
        ) : isError ? (
          <span className="muted">
            —<span className="sr-only"> (unavailable)</span>
          </span>
        ) : (
          `${String(value)}${plus ? '+' : ''}`
        )}
      </div>
      <div className="metric-label">{label}</div>
    </button>
  );
}

function AlertBanner({
  tone,
  text,
  cta,
  onActivate,
}: {
  tone: 'fail' | 'warn';
  text: string;
  cta: string;
  onActivate: () => void;
}) {
  return (
    <div
      className={`alert-banner alert-${tone}`}
      role="status"
      aria-live="polite"
    >
      <span className="alert-banner-dot" aria-hidden="true" />
      <span className="alert-banner-text">{text}</span>
      <Button
        size="sm"
        variant={tone === 'fail' ? 'danger' : 'secondary'}
        onClick={onActivate}
      >
        {cta}
      </Button>
    </div>
  );
}

function RecentTable<T>({
  rows,
  isPending,
  isError,
  error,
  columns,
  rowKey,
  caption,
  emptyTitle,
  limit = RECENT,
}: {
  rows: T[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  caption: string;
  emptyTitle: string;
  limit?: number;
}) {
  const overflow = rows.length - limit;
  return (
    <AsyncList
      isPending={isPending}
      isError={isError}
      error={error}
      isEmpty={rows.length === 0}
      emptyTitle={emptyTitle}
    >
      <DataTable
        columns={columns}
        rows={rows.slice(0, limit)}
        rowKey={rowKey}
        caption={caption}
      />
      {overflow > 0 && (
        <p className="overview-more muted">{`+${String(overflow)} more`}</p>
      )}
    </AsyncList>
  );
}

// Keyed by the generated node vocabularies rather than by their own `as const`
// arrays, so a value the contract adds fails the build here instead of being
// dropped from the tally and quietly under-counting the fleet.
const HEALTH_LABEL: Record<NodeResource['health'], string> = {
  healthy: 'Healthy',
  unknown: 'Unknown',
  unhealthy: 'Unhealthy',
  unreachable: 'Unreachable',
};
const HEALTHS = enumMembers(HEALTH_LABEL);
const STATUS_TONE: Record<NodeResource['status'], BadgeTone> = {
  active: 'pass',
  pending: 'info',
  quarantined: 'warn',
  removed: 'neutral',
};
const STATUSES = enumMembers(STATUS_TONE);

function NodeHealthView({ nodes }: { nodes: NodeResource[] }) {
  const total = nodes.length;
  const health = tally(
    HEALTHS,
    nodes.map((n) => n.health),
  );
  const status = tally(
    STATUSES,
    nodes.map((n) => n.status),
  );
  const summary =
    HEALTHS.filter((h) => health[h] > 0)
      .map((h) => `${String(health[h])} ${HEALTH_LABEL[h].toLowerCase()}`)
      .join(', ') || 'none';

  return (
    <div className="stack">
      <div
        className="health-bar"
        role="img"
        aria-label={`Node health across ${String(total)} nodes: ${summary}`}
      >
        {HEALTHS.filter((h) => health[h] > 0).map((h) => (
          <span
            key={h}
            className={`health-seg h-${h}`}
            style={{ flexGrow: health[h] }}
          />
        ))}
      </div>
      <ul className="health-legend">
        {HEALTHS.map((h) => (
          <li key={h}>
            <span className={`legend-swatch h-${h}`} aria-hidden="true" />
            <span className="legend-count">{health[h]}</span>
            <span>{HEALTH_LABEL[h]}</span>
          </li>
        ))}
      </ul>
      <div className="status-chips">
        {STATUSES.filter((s) => status[s] > 0).map((s) => (
          <Badge
            key={s}
            tone={STATUS_TONE[s]}
          >{`${String(status[s])} ${s}`}</Badge>
        ))}
      </div>
    </div>
  );
}

const CP_HEALTH_TONE: Record<HealthStatus['status'], BadgeTone> = {
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
};
const CP_HEALTH_LABEL: Record<HealthStatus['status'], string> = {
  pass: 'Healthy',
  warn: 'Degraded',
  fail: 'Unhealthy',
};

function ControlPlaneSection() {
  const health = useQuery(healthQueryOptions);
  const version = useQuery(versionQueryOptions);

  const tone: BadgeTone = health.isError
    ? 'fail'
    : health.data
      ? CP_HEALTH_TONE[health.data.status]
      : 'neutral';
  const label = health.isError
    ? 'Unreachable'
    : health.isPending
      ? 'Checking…'
      : CP_HEALTH_LABEL[health.data.status];

  return (
    <Section title="Control Plane" action={<Badge tone={tone}>{label}</Badge>}>
      {version.isError ? (
        <ProblemAlert error={version.error} />
      ) : (
        <DetailList>
          <Detail label="Component">
            {version.isPending ? '…' : version.data.component}
          </Detail>
          <Detail label="Version">
            {version.isPending ? '…' : version.data.version}
          </Detail>
        </DetailList>
      )}
    </Section>
  );
}

// Total by construction rather than exhaustive: `neutral` is the default for
// standing access and for any model added later, which is the right tone to
// guess wrong with. It is not an unfinished switch.
function accessTone(model: AccessModel): BadgeTone {
  return model === 'breakglass'
    ? 'fail'
    : model === 'jit'
      ? 'accent'
      : 'neutral';
}

function outcomeTone(outcome: string): BadgeTone {
  const o = outcome.toLowerCase();
  if (/(deny|denied|fail|error|reject|block)/.test(o)) return 'fail';
  if (/(allow|success|granted|approve|accept|complete|ok)/.test(o))
    return 'pass';
  return 'neutral';
}

function text(value: string | undefined | null): ReactNode {
  return value !== undefined && value !== null && value !== '' ? (
    value
  ) : (
    <span className="muted">—</span>
  );
}

function lockTargetSummary(t: LockTarget): string {
  if (t.all === true) return 'Fleet-wide (all)';
  const parts: string[] = [];
  if (t.identities && t.identities.length > 0)
    parts.push(`identities: ${t.identities.join(', ')}`);
  if (t.groups && t.groups.length > 0)
    parts.push(`groups: ${t.groups.join(', ')}`);
  if (t.nodeIds && t.nodeIds.length > 0)
    parts.push(`nodes: ${t.nodeIds.join(', ')}`);
  if (t.principals && t.principals.length > 0)
    parts.push(`principals: ${t.principals.join(', ')}`);
  if (t.nodeLabels && t.nodeLabels.length > 0)
    parts.push(`labels: ${t.nodeLabels.join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

const SESSION_COLUMNS: Column<SessionResource>[] = [
  { header: 'Identity', cell: (r) => r.identity },
  { header: 'Node', cell: (r) => text(r.nodeName ?? r.nodeId) },
  { header: 'Principal', cell: (r) => r.principal },
  {
    header: 'Access',
    cell: (r) => (
      <Badge tone={accessTone(r.accessModel)}>{r.accessModel}</Badge>
    ),
  },
  { header: 'Started', cell: (r) => <Time value={r.startedAt} /> },
];

function jitColumns(
  canApprove: boolean,
  subject: string | undefined,
  onDecide: (d: { kind: DecisionKind; row: JitRequestResource }) => void,
): Column<JitRequestResource>[] {
  return [
    { header: 'Requester', cell: (r) => r.requester },
    { header: 'Node', cell: (r) => text(r.targetNodeName ?? r.targetNodeId) },
    { header: 'Principal', cell: (r) => r.principal },
    { header: 'Requested', cell: (r) => <Time value={r.requestedAt} /> },
    { header: 'Approve by', cell: (r) => <Time value={r.approvalDeadline} /> },
    {
      header: 'Actions',
      cell: (r) => {
        const isSelf = subject !== undefined && r.requester === subject;
        if (!canApprove || !isPendingJit(r.state) || isSelf) return null;
        return (
          <div className="cluster">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                onDecide({ kind: 'approve', row: r });
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                onDecide({ kind: 'deny', row: r });
              }}
            >
              Deny
            </Button>
          </div>
        );
      },
    },
  ];
}

const LOCK_COLUMNS: Column<LockResource>[] = [
  { header: 'Target', cell: (r) => lockTargetSummary(r.target) },
  { header: 'Reason', cell: (r) => r.reason },
  { header: 'Created', cell: (r) => <Time value={r.createdAt} /> },
  { header: 'Expires', cell: (r) => <Time value={r.expiresAt} /> },
];

const BREAKGLASS_COLUMNS: Column<BreakglassActivationResource>[] = [
  { header: 'Identity', cell: (r) => text(r.identity) },
  { header: 'Principal', cell: (r) => r.principal },
  {
    header: 'Review',
    cell: (r) => (
      <Badge tone={r.reviewStatus === 'pending' ? 'warn' : 'pass'}>
        {r.reviewStatus}
      </Badge>
    ),
  },
  { header: 'Activated', cell: (r) => <Time value={r.activatedAt} /> },
];

const AUDIT_COLUMNS: Column<AuditEventResource>[] = [
  { header: 'When', cell: (r) => <Time value={r.occurredAt} /> },
  { header: 'Actor', cell: (r) => r.actor },
  { header: 'Action', cell: (r) => r.action },
  {
    header: 'Outcome',
    cell: (r) => <Badge tone={outcomeTone(r.outcome)}>{r.outcome}</Badge>,
  },
  { header: 'Subject', cell: (r) => text(r.subject) },
];

function tally<T extends string>(
  keys: readonly T[],
  values: readonly string[],
): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const k of keys) out[k] = 0;
  for (const v of values) {
    const k = keys.find((x) => x === v);
    if (k !== undefined) out[k] += 1;
  }
  return out;
}
