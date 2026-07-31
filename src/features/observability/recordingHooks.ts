import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../../api/client';
import {
  resourceKey,
  useCursorList,
  type CursorListResult,
} from '../../api/http';
import { idempotencyHeader } from '../../api/idempotency';
import { unwrap } from '../../api/problem';
import type { LegalHoldRequest, RecordingResource } from '../../api/types';

export interface RecordingFilters {
  identity?: string;
  sessionId?: string;
  nodeId?: string;
}

function cleanFilters(f: RecordingFilters): RecordingFilters {
  const out: RecordingFilters = {};
  if (f.identity) out.identity = f.identity;
  if (f.sessionId) out.sessionId = f.sessionId;
  if (f.nodeId) out.nodeId = f.nodeId;
  return out;
}

export function useRecordings(
  filters: RecordingFilters,
): CursorListResult<RecordingResource> {
  const query = cleanFilters(filters);
  return useCursorList(
    resourceKey('recordings', query),
    async (cursor, signal) =>
      unwrap(
        await api.GET('/v1/recordings', {
          params: { query: { cursor, ...query } },
          signal,
        }),
      ),
  );
}

export function useSetLegalHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { recordingId: string; body: LegalHoldRequest }) =>
      unwrap(
        await api.PUT('/v1/recordings/{recordingId}/legal-hold', {
          params: {
            path: { recordingId: vars.recordingId },
            header: idempotencyHeader(),
          },
          body: vars.body,
        }),
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('recordings') }),
  });
}

export function useDeleteRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recordingId: string) => {
      unwrap(
        await api.DELETE('/v1/recordings/{recordingId}', {
          params: { path: { recordingId }, header: idempotencyHeader() },
        }),
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: resourceKey('recordings') }),
  });
}
