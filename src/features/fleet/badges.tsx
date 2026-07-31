import { Badge, type BadgeTone } from '../../ui';
import type {
  AccessModel,
  NodeResource,
  SessionResource,
} from '../../api/types';

const STATUS_TONE: Record<NodeResource['status'], BadgeTone> = {
  pending: 'warn',
  active: 'pass',
  quarantined: 'fail',
  removed: 'neutral',
};

const HEALTH_TONE: Record<NodeResource['health'], BadgeTone> = {
  unknown: 'neutral',
  healthy: 'pass',
  unhealthy: 'warn',
  unreachable: 'fail',
};

const ACCESS_TONE: Record<AccessModel, BadgeTone> = {
  standing: 'neutral',
  jit: 'info',
  breakglass: 'fail',
};

export function NodeStatusBadge({
  status,
}: {
  status: NodeResource['status'];
}) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

export function NodeHealthBadge({
  health,
}: {
  health: NodeResource['health'];
}) {
  return <Badge tone={HEALTH_TONE[health]}>{health}</Badge>;
}

export function ConnectorBadge({
  kind,
}: {
  kind: NodeResource['connectorKind'];
}) {
  return <Badge tone={kind === 'agent' ? 'info' : 'neutral'}>{kind}</Badge>;
}

export function AccessModelBadge({ model }: { model: AccessModel }) {
  return <Badge tone={ACCESS_TONE[model]}>{model}</Badge>;
}

/** Shared by the session list and its detail dialog so both render capabilities
 *  identically. */
export function CapabilityBadges({
  caps,
}: {
  caps: SessionResource['capabilities'];
}) {
  if (caps.length === 0) return <span className="muted">—</span>;
  return (
    <span className="label-chips">
      {caps.map((c) => (
        <Badge key={c} tone="neutral">
          {c}
        </Badge>
      ))}
    </span>
  );
}
