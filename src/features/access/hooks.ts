import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../api/client';
import { resourceKey, useCursorList } from '../../api/http';
import { unwrap } from '../../api/problem';
import { useIdempotencyKey } from '../../api/useIdempotencyKey';
import type {
  CaKind,
  CaPublicKey,
  CaResource,
  CreateCaRequest,
  CreateRoleBindingRequest,
  CreateRoleRequest,
  CreateRuleRequest,
  CreateServiceAccountRequest,
  IssueServiceAccountCredentialRequest,
  RoleBindingResource,
  RoleResource,
  RotateCaRequest,
  RuleResource,
  ServiceAccountResource,
  UpdateCaRequest,
  UpdateRoleBindingRequest,
  UpdateRoleRequest,
  UpdateRuleRequest,
  UpdateServiceAccountRequest,
} from '../../api/types';

export function useRules() {
  return useCursorList<RuleResource>(
    resourceKey('rules'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/rules', { params: { query: { cursor } }, signal }),
      ),
  );
}

export function useCreateRule() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateRuleRequest) =>
      unwrap(
        await api.POST('/v1/rules', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({ queryKey: resourceKey('rules') });
    },
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateRuleRequest }) =>
      unwrap(
        await api.PUT('/v1/rules/{ruleId}', {
          params: { path: { ruleId: id } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey('rules') }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/rules/{ruleId}', {
          params: { path: { ruleId: id } },
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey('rules') }),
  });
}

export function useRoles() {
  return useCursorList<RoleResource>(
    resourceKey('roles'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/roles', { params: { query: { cursor } }, signal }),
      ),
  );
}

export function useCreateRole() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateRoleRequest) =>
      unwrap(
        await api.POST('/v1/roles', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({ queryKey: resourceKey('roles') });
    },
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateRoleRequest }) =>
      unwrap(
        await api.PUT('/v1/roles/{roleId}', {
          params: { path: { roleId: id } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey('roles') }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/roles/{roleId}', {
          params: { path: { roleId: id } },
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey('roles') }),
  });
}

export function useRoleBindings() {
  return useCursorList<RoleBindingResource>(
    resourceKey('role-bindings'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/role-bindings', {
          params: { query: { cursor } },
          signal,
        }),
      ),
  );
}

export function useCreateRoleBinding() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateRoleBindingRequest) =>
      unwrap(
        await api.POST('/v1/role-bindings', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({ queryKey: resourceKey('role-bindings') });
    },
  });
}

export function useUpdateRoleBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateRoleBindingRequest;
    }) =>
      unwrap(
        await api.PUT('/v1/role-bindings/{bindingId}', {
          params: { path: { bindingId: id } },
          body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('role-bindings') }),
  });
}

export function useDeleteRoleBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/role-bindings/{bindingId}', {
          params: { path: { bindingId: id } },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('role-bindings') }),
  });
}

export function useCas() {
  return useCursorList<CaResource>(resourceKey('cas'), async (cursor, signal) =>
    unwrap(await api.GET('/v1/cas', { params: { query: { cursor } }, signal })),
  );
}

export function useCreateCa() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateCaRequest) =>
      unwrap(
        await api.POST('/v1/cas', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({ queryKey: resourceKey('cas') });
    },
  });
}

export function useUpdateCa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateCaRequest }) =>
      unwrap(
        await api.PUT('/v1/cas/{caId}', {
          params: { path: { caId: id } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey('cas') }),
  });
}

export function useDeleteCa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/cas/{caId}', { params: { path: { caId: id } } }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey('cas') }),
  });
}

export function useCaPublicKey(caKind: CaKind) {
  return useQuery({
    queryKey: resourceKey('cas', caKind, 'public-key'),
    queryFn: async ({ signal }): Promise<CaPublicKey> =>
      unwrap(
        await api.GET('/v1/cas/{caKind}/public-key', {
          params: { path: { caKind } },
          signal,
        }),
      ),
  });
}

export function useRotateCa() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: RotateCaRequest }) =>
      unwrap(
        await api.POST('/v1/cas/{caId}/rotate', {
          params: { path: { caId: id }, header: idem.header() },
          body,
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({ queryKey: resourceKey('cas') });
    },
  });
}

export function useServiceAccounts() {
  return useCursorList<ServiceAccountResource>(
    resourceKey('service-accounts'),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/service-accounts', {
          params: { query: { cursor } },
          signal,
        }),
      ),
  );
}

export function useCreateServiceAccount() {
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  return useMutation({
    mutationFn: async (body: CreateServiceAccountRequest) =>
      unwrap(
        await api.POST('/v1/service-accounts', {
          body,
          params: { header: idem.header() },
        }),
      ),
    onSuccess: () => {
      idem.reset();
      return qc.invalidateQueries({
        queryKey: resourceKey('service-accounts'),
      });
    },
  });
}

export function useUpdateServiceAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateServiceAccountRequest;
    }) =>
      unwrap(
        await api.PUT('/v1/service-accounts/{serviceAccountId}', {
          params: { path: { serviceAccountId: id } },
          body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('service-accounts') }),
  });
}

export function useDeleteServiceAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/service-accounts/{serviceAccountId}', {
          params: { path: { serviceAccountId: id } },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('service-accounts') }),
  });
}

export function useIssueServiceAccountCredential() {
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: IssueServiceAccountCredentialRequest;
    }) =>
      unwrap(
        await api.POST('/v1/service-accounts/{serviceAccountId}/credentials', {
          params: { path: { serviceAccountId: id } },
          body,
        }),
      ),
  });
}

export function useRevokeServiceAccountCredential() {
  return useMutation({
    mutationFn: async ({
      id,
      credentialId,
    }: {
      id: string;
      credentialId: string;
    }) => {
      unwrap(
        await api.DELETE(
          '/v1/service-accounts/{serviceAccountId}/credentials/{credentialId}',
          { params: { path: { serviceAccountId: id, credentialId } } },
        ),
      );
    },
  });
}
