import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../api/client';
import { unwrap } from '../../api/problem';
import { useCursorList, resourceKey } from '../../api/http';
import { useIdempotencyKey } from '../../api/useIdempotencyKey';
import type {
  CapabilityDefResource,
  CreateCapabilityDefRequest,
  UpdateCapabilityDefRequest,
  JitPolicyResource,
  CreateJitPolicyRequest,
  UpdateJitPolicyRequest,
  BreakglassPolicyResource,
  CreateBreakglassPolicyRequest,
  UpdateBreakglassPolicyRequest,
  NodePolicyResource,
  CreateNodePolicyRequest,
  UpdateNodePolicyRequest,
  SessionLimitPolicyResource,
  CreateSessionLimitPolicyRequest,
  UpdateSessionLimitPolicyRequest,
} from '../../api/types';

// ---------------------------------------------------------------- capability-defs
export function useCapabilityDefs() {
  return useCursorList<CapabilityDefResource>(
    resourceKey('capability-defs'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/capability-defs', {
          params: { query: { cursor } },
          signal,
        }),
      ),
  );
}

export function useCreateCapabilityDef() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateCapabilityDefRequest) =>
      unwrap(
        await api.POST('/v1/capability-defs', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({ queryKey: resourceKey('capability-defs') });
    },
  });
}

export function useUpdateCapabilityDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      body: UpdateCapabilityDefRequest;
    }) =>
      unwrap(
        await api.PUT('/v1/capability-defs/{capabilityDefId}', {
          params: { path: { capabilityDefId: args.id } },
          body: args.body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('capability-defs') }),
  });
}

export function useDeleteCapabilityDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/capability-defs/{capabilityDefId}', {
          params: { path: { capabilityDefId: id } },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('capability-defs') }),
  });
}

// -------------------------------------------------------------------- jit-policies
export function useJitPolicies() {
  return useCursorList<JitPolicyResource>(
    resourceKey('jit-policies'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/jit-policies', {
          params: { query: { cursor } },
          signal,
        }),
      ),
  );
}

export function useCreateJitPolicy() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateJitPolicyRequest) =>
      unwrap(
        await api.POST('/v1/jit-policies', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({ queryKey: resourceKey('jit-policies') });
    },
  });
}

export function useUpdateJitPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; body: UpdateJitPolicyRequest }) =>
      unwrap(
        await api.PUT('/v1/jit-policies/{jitPolicyId}', {
          params: { path: { jitPolicyId: args.id } },
          body: args.body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('jit-policies') }),
  });
}

export function useDeleteJitPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/jit-policies/{jitPolicyId}', {
          params: { path: { jitPolicyId: id } },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('jit-policies') }),
  });
}

// ------------------------------------------------------------- breakglass-policies
export function useBreakglassPolicies() {
  return useCursorList<BreakglassPolicyResource>(
    resourceKey('breakglass-policies'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/breakglass-policies', {
          params: { query: { cursor } },
          signal,
        }),
      ),
  );
}

export function useCreateBreakglassPolicy() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateBreakglassPolicyRequest) =>
      unwrap(
        await api.POST('/v1/breakglass-policies', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({
        queryKey: resourceKey('breakglass-policies'),
      });
    },
  });
}

export function useUpdateBreakglassPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      body: UpdateBreakglassPolicyRequest;
    }) =>
      unwrap(
        await api.PUT('/v1/breakglass-policies/{breakglassPolicyId}', {
          params: { path: { breakglassPolicyId: args.id } },
          body: args.body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('breakglass-policies') }),
  });
}

export function useDeleteBreakglassPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/breakglass-policies/{breakglassPolicyId}', {
          params: { path: { breakglassPolicyId: id } },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('breakglass-policies') }),
  });
}

// ------------------------------------------------------------------- node-policies
export function useNodePolicies() {
  return useCursorList<NodePolicyResource>(
    resourceKey('node-policies'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/node-policies', {
          params: { query: { cursor } },
          signal,
        }),
      ),
  );
}

export function useCreateNodePolicy() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateNodePolicyRequest) =>
      unwrap(
        await api.POST('/v1/node-policies', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({ queryKey: resourceKey('node-policies') });
    },
  });
}

export function useUpdateNodePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; body: UpdateNodePolicyRequest }) =>
      unwrap(
        await api.PUT('/v1/node-policies/{nodePolicyId}', {
          params: { path: { nodePolicyId: args.id } },
          body: args.body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('node-policies') }),
  });
}

export function useDeleteNodePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/node-policies/{nodePolicyId}', {
          params: { path: { nodePolicyId: id } },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('node-policies') }),
  });
}

// ------------------------------------------------------------ session-limit-policies
export function useSessionLimitPolicies() {
  return useCursorList<SessionLimitPolicyResource>(
    resourceKey('session-limit-policies'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/session-limit-policies', {
          params: { query: { cursor } },
          signal,
        }),
      ),
  );
}

export function useCreateSessionLimitPolicy() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateSessionLimitPolicyRequest) =>
      unwrap(
        await api.POST('/v1/session-limit-policies', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({
        queryKey: resourceKey('session-limit-policies'),
      });
    },
  });
}

export function useUpdateSessionLimitPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      body: UpdateSessionLimitPolicyRequest;
    }) =>
      unwrap(
        await api.PUT('/v1/session-limit-policies/{sessionLimitPolicyId}', {
          params: { path: { sessionLimitPolicyId: args.id } },
          body: args.body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('session-limit-policies') }),
  });
}

export function useDeleteSessionLimitPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/session-limit-policies/{sessionLimitPolicyId}', {
          params: { path: { sessionLimitPolicyId: id } },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('session-limit-policies') }),
  });
}
