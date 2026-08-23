import { useQuery } from '@tanstack/react-query';

import {
  healthQueryOptions,
  versionQueryOptions,
  type HealthStatus,
} from '../api/queries';

const HEALTH_LABEL: Record<HealthStatus['status'], string> = {
  pass: 'Healthy',
  warn: 'Degraded',
  fail: 'Unhealthy',
};

export function HealthVersionPanel() {
  const version = useQuery(versionQueryOptions);
  const health = useQuery(healthQueryOptions);

  return (
    <section className="panel" aria-labelledby="panel-title">
      <div className="panel-head">
        <h1 id="panel-title">Control Plane</h1>
        <HealthBadge
          status={health.data?.status}
          isPending={health.isPending}
          isError={health.isError}
        />
      </div>

      {version.isPending && (
        <p className="muted" role="status">
          Loading version metadata…
        </p>
      )}

      {version.isError && (
        <p className="error" role="alert" data-testid="version-error">
          {version.error.message}
        </p>
      )}

      {version.data && (
        <dl className="kv" data-testid="version-info">
          <div className="kv-row">
            <dt>Component</dt>
            <dd data-testid="component">{version.data.component}</dd>
          </div>
          <div className="kv-row">
            <dt>Version</dt>
            <dd data-testid="version">{version.data.version}</dd>
          </div>
          <div className="kv-row">
            <dt>CP&nbsp;↔&nbsp;Gateway gRPC</dt>
            <dd data-testid="protocol-controlPlaneGatewayGrpc">
              {formatRange(
                version.data.protocols.controlPlaneGatewayGrpc.min,
                version.data.protocols.controlPlaneGatewayGrpc.max,
              )}
            </dd>
          </div>
          <div className="kv-row">
            <dt>Agent&nbsp;↔&nbsp;Gateway wire</dt>
            <dd data-testid="protocol-agentGatewayWire">
              {formatRange(
                version.data.protocols.agentGatewayWire.min,
                version.data.protocols.agentGatewayWire.max,
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function formatRange(min: string, max: string): string {
  return min === max ? min : `${min} – ${max}`;
}

function HealthBadge({
  status,
  isPending,
  isError,
}: {
  status: HealthStatus['status'] | undefined;
  isPending: boolean;
  isError: boolean;
}) {
  const tone = isError ? 'fail' : (status ?? (isPending ? 'pending' : 'fail'));
  const label = isError
    ? 'Unreachable'
    : isPending
      ? 'Checking…'
      : status
        ? HEALTH_LABEL[status]
        : 'Unknown';

  return (
    <span className={`badge badge-${tone}`} data-testid="health-badge">
      {label}
    </span>
  );
}
