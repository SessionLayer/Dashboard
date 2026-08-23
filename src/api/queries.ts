import { queryOptions } from '@tanstack/react-query';

import { api } from './client';
import { unwrap } from './problem';
import type { HealthStatus, VersionInfo } from './types';

export { ProblemError } from './problem';
export type { HealthStatus, VersionInfo, ProblemDetails } from './types';

export const versionQueryOptions = queryOptions({
  queryKey: ['cp', 'version'] as const,
  queryFn: async ({ signal }): Promise<VersionInfo> =>
    unwrap(await api.GET('/v1/version', { signal })),
});

export const healthQueryOptions = queryOptions({
  queryKey: ['cp', 'healthz'] as const,
  queryFn: async ({ signal }): Promise<HealthStatus> =>
    unwrap(await api.GET('/v1/healthz', { signal })),
});
