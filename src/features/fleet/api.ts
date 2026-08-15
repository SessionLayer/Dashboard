import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../api/client';
import {
  resourceKey,
  useCursorList,
  type CursorListResult,
} from '../../api/http';
import { idempotencyHeader } from '../../api/idempotency';
import { unwrap } from '../../api/problem';
import type {
  AccessModel,
  GatewayEnrollmentTokenResource,
  IssueGatewayEnrollmentTokenRequest,
  IssueJoinTokenRequest,
  IssuedGatewayEnrollmentToken,
  IssuedJoinToken,
  JoinTokenResource,
  MtlsTrustAnchor,
  NodeResource,
  QuarantineNodeRequest,
  RegisterNodeRequest,
  ReleaseSessionLeaseRequest,
  SessionLeaseResource,
  SessionResource,
  TerminateSessionRequest,
} from '../../api/types';

const NODES_KEY = resourceKey('nodes');
const JOIN_TOKENS_KEY = resourceKey('joinTokens');
const GATEWAY_ENROLLMENT_TOKENS_KEY = resourceKey('gatewayEnrollmentTokens');
const SESSIONS_KEY = resourceKey('sessions');

// ---- Nodes -----------------------------------------------------------------

export function useNodes() {
  return useQuery({
    queryKey: NODES_KEY,
    queryFn: async ({ signal }): Promise<NodeResource[]> =>
      unwrap(await api.GET('/v1/nodes', { signal })).nodes,
  });
}

/** Fresh single-node detail; only fetched while the detail dialog is open. */
export function useNode(nodeId: string | undefined) {
  return useQuery({
    queryKey: resourceKey('nodes', nodeId),
    enabled: nodeId !== undefined,
    queryFn: async ({ signal }): Promise<NodeResource> =>
      unwrap(
        await api.GET('/v1/nodes/{nodeId}', {
          params: { path: { nodeId: nodeId ?? '' } },
          signal,
        }),
      ),
  });
}

// NB: no contract-defined Idempotency-Key parameter on this operation — the
// same gap as the IR/access mutations.
export function useRegisterNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterNodeRequest): Promise<NodeResource> =>
      unwrap(await api.POST('/v1/nodes', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  });
}

export function useRemoveNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nodeId: string): Promise<void> => {
      unwrap(
        await api.DELETE('/v1/nodes/{nodeId}', {
          params: { path: { nodeId } },
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  });
}

export function useQuarantineNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nodeId: string;
      body: QuarantineNodeRequest;
    }): Promise<NodeResource> =>
      unwrap(
        await api.POST('/v1/nodes/{nodeId}/quarantine', {
          params: { path: { nodeId: input.nodeId } },
          body: input.body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  });
}

export function useReleaseQuarantine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nodeId: string): Promise<NodeResource> =>
      unwrap(
        await api.DELETE('/v1/nodes/{nodeId}/quarantine', {
          params: { path: { nodeId } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: NODES_KEY }),
  });
}

// ---- Join tokens -----------------------------------------------------------

export function useJoinTokens() {
  return useQuery({
    queryKey: JOIN_TOKENS_KEY,
    queryFn: async ({ signal }): Promise<JoinTokenResource[]> =>
      unwrap(await api.GET('/v1/join-tokens', { signal })).joinTokens,
  });
}

export function useIssueJoinToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: IssueJoinTokenRequest): Promise<IssuedJoinToken> =>
      unwrap(await api.POST('/v1/join-tokens', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: JOIN_TOKENS_KEY }),
  });
}

export function useRevokeJoinToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (joinTokenId: string): Promise<void> => {
      unwrap(
        await api.DELETE('/v1/join-tokens/{joinTokenId}', {
          params: { path: { joinTokenId } },
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: JOIN_TOKENS_KEY }),
  });
}

// ---- Gateway enrollment tokens ---------------------------------------------

export function useGatewayEnrollmentTokens() {
  return useQuery({
    queryKey: GATEWAY_ENROLLMENT_TOKENS_KEY,
    queryFn: async ({ signal }): Promise<GatewayEnrollmentTokenResource[]> =>
      unwrap(await api.GET('/v1/gateway-enrollment-tokens', { signal }))
        .gatewayEnrollmentTokens,
  });
}

// The raw token lives only in this mutation's in-memory result — it is returned
// exactly once and the list operation never carries it.
export function useIssueGatewayEnrollmentToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: IssueGatewayEnrollmentTokenRequest,
    ): Promise<IssuedGatewayEnrollmentToken> =>
      unwrap(await api.POST('/v1/gateway-enrollment-tokens', { body })),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: GATEWAY_ENROLLMENT_TOKENS_KEY }),
  });
}

export function useRevokeGatewayEnrollmentToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (gatewayEnrollmentTokenId: string): Promise<void> => {
      unwrap(
        await api.DELETE(
          '/v1/gateway-enrollment-tokens/{gatewayEnrollmentTokenId}',
          { params: { path: { gatewayEnrollmentTokenId } } },
        ),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: GATEWAY_ENROLLMENT_TOKENS_KEY }),
  });
}

/**
 * The internal mTLS CA certificate a Gateway pins. Public material, and a
 * read-only sibling of `/v1/cas` rather than a member of it — it has no `caId`
 * and no rotate/update/delete surface.
 */
export function useMtlsTrustAnchor() {
  return useQuery({
    queryKey: resourceKey('mtlsTrustAnchor'),
    queryFn: async ({ signal }): Promise<MtlsTrustAnchor> =>
      unwrap(await api.GET('/v1/cas/mtls/trust-anchor', { signal })),
  });
}

// ---- Sessions --------------------------------------------------------------

export interface SessionFilters {
  identity?: string;
  accessModel?: AccessModel;
  activeOnly?: boolean;
}

export function useSessions(
  filters: SessionFilters,
): CursorListResult<SessionResource> {
  return useCursorList(
    resourceKey('sessions', filters),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/sessions', {
          params: {
            query: {
              cursor,
              ...(filters.identity !== undefined && filters.identity !== ''
                ? { identity: filters.identity }
                : {}),
              ...(filters.accessModel !== undefined
                ? { accessModel: filters.accessModel }
                : {}),
              ...(filters.activeOnly === true ? { activeOnly: true } : {}),
            },
          },
          signal,
        }),
      ),
  );
}

// ---- Session leases --------------------------------------------------------

export interface SessionLeaseFilters {
  identity?: string;
  activeOnly?: boolean;
}

/**
 * The rows the per-identity concurrency cap is counted from. A lease that
 * outlived its session refuses the identity with the same generic policy denial
 * as a real deny, so this list is how the two are told apart.
 */
export function useSessionLeases(
  filters: SessionLeaseFilters,
): CursorListResult<SessionLeaseResource> {
  return useCursorList(
    resourceKey('sessionLeases', filters),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/session-leases', {
          params: {
            query: {
              cursor,
              ...(filters.identity !== undefined && filters.identity !== ''
                ? { identity: filters.identity }
                : {}),
              ...(filters.activeOnly === true ? { activeOnly: true } : {}),
            },
          },
          signal,
        }),
      ),
  );
}

export function useReleaseSessionLease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sessionLeaseId: string;
      body: ReleaseSessionLeaseRequest;
    }): Promise<SessionLeaseResource> =>
      unwrap(
        await api.POST('/v1/session-leases/{sessionLeaseId}/release', {
          params: {
            path: { sessionLeaseId: input.sessionLeaseId },
            header: idempotencyHeader(),
          },
          body: input.body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('sessionLeases') }),
  });
}

export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: resourceKey('sessions', 'one', sessionId),
    enabled: sessionId !== undefined,
    queryFn: async ({ signal }): Promise<SessionResource> =>
      unwrap(
        await api.GET('/v1/sessions/{sessionId}', {
          params: { path: { sessionId: sessionId ?? '' } },
          signal,
        }),
      ),
  });
}

export function useTerminateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      body: TerminateSessionRequest;
    }): Promise<SessionResource> =>
      unwrap(
        await api.POST('/v1/sessions/{sessionId}/terminate', {
          params: {
            path: { sessionId: input.sessionId },
            header: idempotencyHeader(),
          },
          body: input.body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}
