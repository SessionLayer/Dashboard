import { useState } from 'react';

import {
  AsyncList,
  Badge,
  Button,
  Detail,
  DetailList,
  FormActions,
  NumberField,
  PageHeader,
  ProblemAlert,
  SelectField,
  Time,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { OperatorSettings, WormMode } from '../../api/types';
import { useOperatorSettings, useUpdateOperatorSettings } from './api';
import {
  conflictHint,
  pinnedBy,
  pinnedReason,
  retentionRatchetError,
  wormOptions,
  wormRatchetError,
} from './helpers';
import { RecordingCustomerKeyPanel } from './RecordingCustomerKeyPanel';
import './settings.css';

export function OperatorSettingsScreen() {
  const settings = useOperatorSettings();
  // Owned by the screen, not the form: a successful save bumps the version,
  // which remounts the form. A confirmation living inside it would be destroyed
  // by the very refetch that proves the save landed.
  const update = useUpdateOperatorSettings();

  return (
    <section className="screen">
      <PageHeader
        title="Operator settings"
        description="Cluster-wide defaults: audit and recording retention, the WORM mode stamped on new recordings, the OTP lifetime, the session-limit cluster defaults, and the customer recording key."
      />
      <AsyncList
        isPending={settings.isPending}
        isError={settings.isError}
        error={settings.error}
        isEmpty={false}
        emptyTitle="No operator settings."
      >
        {settings.data !== undefined && (
          <>
            {/* Remount on version change so a save (or a recording-key write,
                which bumps the same row) reloads the form from the server
                rather than leaving edits sitting on a stale version. */}
            <OperatorSettingsForm
              key={settings.data.version}
              settings={settings.data}
              update={update}
            />
            <RecordingCustomerKeyPanel
              settingsVersion={settings.data.version}
              configured={settings.data.recordingKeyConfigured}
              recordingRetentionDays={settings.data.recordingRetentionDays}
            />
          </>
        )}
      </AsyncList>
    </section>
  );
}

function OperatorSettingsForm({
  settings,
  update,
}: {
  settings: OperatorSettings;
  update: ReturnType<typeof useUpdateOperatorSettings>;
}) {
  const canWrite = useCan('settings:write');

  const [auditRetention, setAuditRetention] = useState<number | ''>(
    settings.auditRetentionDays,
  );
  const [recordingRetention, setRecordingRetention] = useState<number | ''>(
    settings.recordingRetentionDays,
  );
  const [wormMode, setWormMode] = useState<WormMode>(settings.defaultWormMode);
  const [otpTtl, setOtpTtl] = useState<number | ''>(settings.otpTtlSeconds);
  const [maxSession, setMaxSession] = useState<number | ''>(
    settings.defaultMaxSessionSeconds ?? '',
  );
  const [idleTimeout, setIdleTimeout] = useState<number | ''>(
    settings.defaultIdleTimeoutSeconds ?? '',
  );
  const [maxConcurrent, setMaxConcurrent] = useState<number | ''>(
    settings.defaultMaxConcurrentSessions ?? '',
  );

  const managed = settings.deploymentManagedFields;
  const pinnedMaxSession = pinnedBy('defaultMaxSessionSeconds', managed);
  const pinnedIdle = pinnedBy('defaultIdleTimeoutSeconds', managed);
  const pinnedConcurrent = pinnedBy('defaultMaxConcurrentSessions', managed);

  const auditError = retentionRatchetError(
    settings.auditRetentionDays,
    auditRetention,
  );
  const recordingError = retentionRatchetError(
    settings.recordingRetentionDays,
    recordingRetention,
  );
  const wormError = wormRatchetError(settings.defaultWormMode, wormMode);
  const otpError =
    otpTtl !== '' && (otpTtl < 60 || otpTtl > 300)
      ? 'Between 60 and 300 seconds.'
      : undefined;
  const missing =
    auditRetention === '' || recordingRetention === '' || otpTtl === '';
  const blocked =
    missing ||
    [auditError, recordingError, wormError, otpError].some(
      (e) => e !== undefined,
    );

  const submit = () => {
    if (auditRetention === '' || recordingRetention === '' || otpTtl === '') {
      return;
    }
    // A session-limit default left blank is CLEARED by omission, so every knob
    // the operator did not blank is sent back explicitly.
    update.mutate({
      auditRetentionDays: auditRetention,
      recordingRetentionDays: recordingRetention,
      defaultWormMode: wormMode,
      otpTtlSeconds: otpTtl,
      version: settings.version,
      ...(maxSession === '' ? {} : { defaultMaxSessionSeconds: maxSession }),
      ...(idleTimeout === '' ? {} : { defaultIdleTimeoutSeconds: idleTimeout }),
      ...(maxConcurrent === ''
        ? {}
        : { defaultMaxConcurrentSessions: maxConcurrent }),
    });
  };

  const hint = conflictHint(update.error);

  return (
    <div className="settings-form">
      <h2 className="settings-section-title">Evidence retention</h2>
      <p className="muted settings-section-note">
        These three only move towards keeping more evidence. Weakening any of
        them stays a database-owner action, out of band and deliberate — the API
        refuses it at every permission level, including this one.
      </p>
      <NumberField
        label="Audit retention (days)"
        required
        min={settings.auditRetentionDays}
        value={auditRetention}
        onChange={setAuditRetention}
        error={auditError}
        disabled={!canWrite}
        hint={`Increase-only. Currently ${String(settings.auditRetentionDays)} days; shortening it would let the next prune drop partitions it is keeping today.`}
      />
      <NumberField
        label="Recording retention (days)"
        required
        min={settings.recordingRetentionDays}
        value={recordingRetention}
        onChange={setRecordingRetention}
        error={recordingError}
        disabled={!canWrite}
        hint={`Increase-only. Currently ${String(settings.recordingRetentionDays)} days; this is stamped on new recordings as the object-lock retain-until.`}
      />
      <SelectField
        label="Default WORM mode"
        required
        value={wormMode}
        onChange={setWormMode}
        options={wormOptions(settings.defaultWormMode)}
        error={wormError}
        disabled={!canWrite}
        hint={
          settings.defaultWormMode === 'compliance'
            ? 'Already in compliance mode. Returning to governance is not offered here: it would make new recordings deletable again, and the API refuses it at every permission level.'
            : 'Moving to compliance is one-way through this API — once new recordings are un-deletable, only the database owner can undo it.'
        }
      />

      <h2 className="settings-section-title">Authentication</h2>
      <NumberField
        label="OTP lifetime (seconds)"
        required
        min={60}
        max={300}
        value={otpTtl}
        onChange={setOtpTtl}
        error={otpError}
        disabled={!canWrite}
        hint="How long an issued one-time passcode stays valid. 60–300 seconds."
      />

      <h2 className="settings-section-title">Session-limit cluster defaults</h2>
      <p className="muted settings-section-note">
        Apply to every identity with no matching session-limit policy. Leave one
        blank to clear it — that knob then imposes no cluster-wide ceiling.
      </p>
      <NumberField
        label="Default max concurrent sessions"
        min={1}
        value={maxConcurrent}
        onChange={setMaxConcurrent}
        disabled={!canWrite || pinnedConcurrent !== undefined}
        hint={
          pinnedConcurrent !== undefined
            ? pinnedReason(pinnedConcurrent)
            : 'Blank means uncapped by default.'
        }
      />
      <NumberField
        label="Default max session duration (seconds)"
        min={1}
        value={maxSession}
        onChange={setMaxSession}
        disabled={!canWrite || pinnedMaxSession !== undefined}
        hint={
          pinnedMaxSession !== undefined
            ? pinnedReason(pinnedMaxSession)
            : 'Folded into the decision grant expiry. Blank means no cluster-wide ceiling.'
        }
      />
      <NumberField
        label="Default idle timeout (seconds)"
        min={1}
        value={idleTimeout}
        onChange={setIdleTimeout}
        disabled={!canWrite || pinnedIdle !== undefined}
        hint={
          pinnedIdle !== undefined
            ? pinnedReason(pinnedIdle)
            : 'Signed into the decision context and enforced tighten-only by the Gateway. Blank means none.'
        }
      />

      <h2 className="settings-section-title">Read-only</h2>
      <DetailList>
        <Detail label="Default CA backend">
          <span className="cluster">
            <code>{settings.defaultCaBackend}</code>
            <Badge tone="neutral">read-only</Badge>
          </span>
          <p className="muted settings-detail-note">
            Consumed only when cold start provisions a CA kind that has no row
            yet, so once the CAs exist it governs nothing. The backend of a live
            CA is managed under Certificate authorities.
          </p>
        </Detail>
        <Detail label="Origin">{settings.origin}</Detail>
        <Detail label="Version">{settings.version}</Detail>
        {settings.createdAt !== undefined && (
          <Detail label="Created">
            <Time value={settings.createdAt} />
          </Detail>
        )}
        {settings.updatedAt !== undefined && (
          <Detail label="Updated">
            <Time value={settings.updatedAt} />
          </Detail>
        )}
      </DetailList>

      {canWrite ? (
        <FormActions>
          <Button
            variant="primary"
            onClick={submit}
            disabled={update.isPending || blocked}
          >
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {update.isSuccess && (
            <span className="muted" role="status">
              Saved. The version below is the one your next save must match.
            </span>
          )}
        </FormActions>
      ) : (
        <p className="muted" role="note">
          Read-only view — saving operator settings requires the{' '}
          <code>settings:write</code> permission.
        </p>
      )}

      {update.error !== null && <ProblemAlert error={update.error} />}
      {hint !== undefined && (
        <p className="muted" role="note">
          {hint}
        </p>
      )}
    </div>
  );
}
