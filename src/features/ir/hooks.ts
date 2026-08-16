import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../api/client';
import { resourceKey } from '../../api/http';
import { unwrap } from '../../api/problem';
import type {
  BreakglassActivationResource,
  BreakglassCredentialResource,
  BreakglassOfflineCodeResource,
  CreateLockRequest,
  CreatePinRequest,
  IssueBreakglassOfflineCodesRequest,
  IssuedBreakglassOfflineCodes,
  IssueOtpRequest,
  IssuedOtp,
  JitRequestResource,
  JitRequestSubmission,
  LockResource,
  PinResource,
  RegisterBreakglassCredentialRequest,
} from '../../api/types';

const JIT_KEY = 'jit-requests';
const LOCK_KEY = 'locks';
const BG_CRED_KEY = 'breakglass-credentials';
const BG_CODE_KEY = 'breakglass-offline-codes';
const BG_ACT_KEY = 'breakglass-activations';
const PIN_KEY = 'pins';

export interface ActionVars {
  id: string;
  reason?: string;
}

function decisionBody(reason?: string): { reason?: string } {
  const trimmed = reason?.trim();
  return trimmed !== undefined && trimmed !== '' ? { reason: trimmed } : {};
}

export function useJitRequests(
  state: string,
): UseQueryResult<JitRequestResource[]> {
  return useQuery({
    queryKey: resourceKey(JIT_KEY, state),
    queryFn: async ({ signal }) => {
      const query = state !== '' ? { state } : {};
      const data = unwrap(
        await api.GET('/v1/jit-requests', { params: { query }, signal }),
      );
      return data.jitRequests;
    },
  });
}

export function useJitRequest(
  id: string,
  enabled: boolean,
): UseQueryResult<JitRequestResource> {
  return useQuery({
    queryKey: resourceKey(JIT_KEY, 'detail', id),
    enabled,
    queryFn: async ({ signal }) =>
      unwrap(
        await api.GET('/v1/jit-requests/{jitRequestId}', {
          params: { path: { jitRequestId: id } },
          signal,
        }),
      ),
  });
}

export function useSubmitJitRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: JitRequestSubmission) =>
      unwrap(await api.POST('/v1/jit-requests', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey(JIT_KEY) }),
  });
}

export function useApproveJit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: ActionVars) =>
      unwrap(
        await api.POST('/v1/jit-requests/{jitRequestId}/approve', {
          params: { path: { jitRequestId: id } },
          body: decisionBody(reason),
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey(JIT_KEY) }),
  });
}

export function useDenyJit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: ActionVars) =>
      unwrap(
        await api.POST('/v1/jit-requests/{jitRequestId}/deny', {
          params: { path: { jitRequestId: id } },
          body: decisionBody(reason),
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey(JIT_KEY) }),
  });
}

export function useRevokeJit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: ActionVars) =>
      unwrap(
        await api.POST('/v1/jit-requests/{jitRequestId}/revoke', {
          params: { path: { jitRequestId: id } },
          body: decisionBody(reason),
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey(JIT_KEY) }),
  });
}

export function useLocks(): UseQueryResult<LockResource[]> {
  return useQuery({
    queryKey: resourceKey(LOCK_KEY),
    queryFn: async ({ signal }) => {
      const data = unwrap(await api.GET('/v1/locks', { signal }));
      return data.locks;
    },
  });
}

export function useCreateLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateLockRequest) =>
      unwrap(await api.POST('/v1/locks', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey(LOCK_KEY) }),
  });
}

export function useReleaseLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/locks/{lockId}', {
          params: { path: { lockId: id } },
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey(LOCK_KEY) }),
  });
}

export function useBreakglassCredentials(): UseQueryResult<
  BreakglassCredentialResource[]
> {
  return useQuery({
    queryKey: resourceKey(BG_CRED_KEY),
    queryFn: async ({ signal }) => {
      const data = unwrap(
        await api.GET('/v1/breakglass/credentials', { signal }),
      );
      return data.credentials;
    },
  });
}

export function useRegisterBreakglassCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterBreakglassCredentialRequest) =>
      unwrap(await api.POST('/v1/breakglass/credentials', { body })),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey(BG_CRED_KEY) }),
  });
}

export function useRevokeBreakglassCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/breakglass/credentials/{credentialId}', {
          params: { path: { credentialId: id } },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey(BG_CRED_KEY) }),
  });
}

export function useBreakglassOfflineCodes(): UseQueryResult<
  BreakglassOfflineCodeResource[]
> {
  return useQuery({
    queryKey: resourceKey(BG_CODE_KEY),
    queryFn: async ({ signal }) => {
      const data = unwrap(
        await api.GET('/v1/breakglass/offline-codes', { signal }),
      );
      return data.offlineCodes;
    },
  });
}

export function useIssueBreakglassOfflineCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: IssueBreakglassOfflineCodesRequest,
    ): Promise<IssuedBreakglassOfflineCodes> =>
      unwrap(await api.POST('/v1/breakglass/offline-codes', { body })),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey(BG_CODE_KEY) }),
  });
}

export function useBreakglassActivations(
  reviewStatus: '' | 'pending' | 'reviewed',
): UseQueryResult<BreakglassActivationResource[]> {
  return useQuery({
    queryKey: resourceKey(BG_ACT_KEY, reviewStatus),
    queryFn: async ({ signal }) => {
      const query = reviewStatus !== '' ? { reviewStatus } : {};
      const data = unwrap(
        await api.GET('/v1/breakglass/activations', {
          params: { query },
          signal,
        }),
      );
      return data.activations;
    },
  });
}

export function useReviewBreakglassActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: ActionVars) => {
      const note = reason?.trim();
      return unwrap(
        await api.POST('/v1/breakglass/activations/{activationId}/review', {
          params: { path: { activationId: id } },
          body: note !== undefined && note !== '' ? { note } : {},
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey(BG_ACT_KEY) }),
  });
}

export function usePins(identity: string): UseQueryResult<PinResource[]> {
  const trimmed = identity.trim();
  return useQuery({
    queryKey: resourceKey(PIN_KEY, trimmed),
    enabled: trimmed !== '',
    queryFn: async ({ signal }) => {
      const data = unwrap(
        await api.GET('/v1/pins', {
          params: { query: { identity: trimmed } },
          signal,
        }),
      );
      return data.pins;
    },
  });
}

export function useCreatePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreatePinRequest) =>
      unwrap(await api.POST('/v1/pins', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey(PIN_KEY) }),
  });
}

export function useRevokePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await api.DELETE('/v1/pins/{pinId}', {
          params: { path: { pinId: id } },
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceKey(PIN_KEY) }),
  });
}

export function useIssueOtp() {
  return useMutation({
    mutationFn: async (body: IssueOtpRequest): Promise<IssuedOtp> =>
      unwrap(await api.POST('/v1/otp', { body })),
  });
}
