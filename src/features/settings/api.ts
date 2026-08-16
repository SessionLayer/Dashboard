import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../api/client';
import { resourceKey } from '../../api/http';
import { unwrap } from '../../api/problem';
import type {
  OperatorSettings,
  RecordingCustomerKey,
  SetRecordingCustomerKeyRequest,
  UpdateOperatorSettingsRequest,
} from '../../api/types';

const SETTINGS_KEY = resourceKey('operatorSettings');
const RECORDING_KEY = resourceKey('recordingCustomerKey');

export function useOperatorSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async ({ signal }): Promise<OperatorSettings> =>
      unwrap(await api.GET('/v1/operator-settings', { signal })),
  });
}

export function useUpdateOperatorSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: UpdateOperatorSettingsRequest,
    ): Promise<OperatorSettings> =>
      unwrap(await api.PUT('/v1/operator-settings', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

/**
 * Public key material only. An unprovisioned key is a `200` with
 * `configured: false` — the normal state of a fresh install, not an error.
 */
export function useRecordingCustomerKey() {
  return useQuery({
    queryKey: RECORDING_KEY,
    queryFn: async ({ signal }): Promise<RecordingCustomerKey> =>
      unwrap(
        await api.GET('/v1/operator-settings/recording-customer-key', {
          signal,
        }),
      ),
  });
}

/**
 * A write here also bumps the settings row's version, so both queries are
 * invalidated — leaving the stale version in the form would turn the operator's
 * next save into a spurious 409.
 */
export function useSetRecordingCustomerKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: SetRecordingCustomerKeyRequest,
    ): Promise<RecordingCustomerKey> =>
      unwrap(
        await api.PUT('/v1/operator-settings/recording-customer-key', { body }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: RECORDING_KEY });
      await qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
