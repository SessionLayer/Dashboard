import { useQuery } from '@tanstack/react-query';

import { versionQueryOptions } from '../api/queries';

/** The sidebar's control-plane version readout. Sourced from `GET /v1/version`,
 * never from this package's own version: it names the backend the console is
 * talking to, which upgrades independently of the SPA. Until the probe answers
 * it shows a placeholder rather than a guess — a stale number here would assert
 * a version the operator is not running. Shares `versionQueryOptions`' cache key
 * with HealthVersionPanel, so it issues no extra request. */
export function ControlPlaneVersion() {
  const { data } = useQuery(versionQueryOptions);

  return (
    <span data-testid="sidebar-cp-version">
      control-plane {data ? `v${data.version}` : '—'}
    </span>
  );
}
