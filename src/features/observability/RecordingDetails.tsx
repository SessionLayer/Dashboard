import { useState } from 'react';

import {
  Badge,
  Button,
  ConfirmDialog,
  Detail,
  DetailList,
  Dialog,
  TextareaField,
  Time,
} from '../../ui';
import { useCan } from '../../auth/AuthContext';
import type { RecordingResource } from '../../api/types';
import { formatBytes } from './format';
import { statusTone, wormTone } from './badges';
import { useDeleteRecording, useSetLegalHold } from './recordingHooks';

/**
 * Recording metadata + the privileged governance actions (legal hold, governance
 * delete). Compliance-mode or held recordings are refused server-side (409),
 * surfaced inline via the confirm dialog.
 */
export function RecordingDetails({
  recording,
  onClose,
}: {
  recording: RecordingResource;
  onClose: () => void;
}) {
  const canDelete = useCan('recording:delete');
  const legalHold = useSetLegalHold();
  const del = useDeleteRecording();

  const [holdOpen, setHoldOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Track legal-hold locally: the `recording` prop is a list-row snapshot, and
  // invalidating the list does not refresh this open dialog. Flip on success so
  // the badge, the button label, and the confirmation reflect the new state.
  const [held, setHeld] = useState(recording.legalHold === true);
  const [holdMessage, setHoldMessage] = useState<string | undefined>();

  const submitHold = () => {
    const target = !held;
    legalHold.mutate(
      {
        recordingId: recording.id,
        body: { held: target, reason: reason || undefined },
      },
      {
        onSuccess: () => {
          setHeld(target);
          setHoldOpen(false);
          setReason('');
          setHoldMessage(
            target ? 'Legal hold placed.' : 'Legal hold released.',
          );
        },
      },
    );
  };

  const submitDelete = () => {
    del.mutate(recording.id, {
      onSuccess: () => {
        setDeleteOpen(false);
        onClose();
      },
    });
  };

  return (
    <Dialog
      title="Recording"
      onClose={onClose}
      footer={
        canDelete ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setReason('');
                setHoldOpen(true);
              }}
            >
              {held ? 'Release legal hold' : 'Place legal hold'}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeleteOpen(true);
              }}
            >
              Delete…
            </Button>
          </>
        ) : undefined
      }
    >
      <DetailList>
        <Detail label="Recording ID">
          <code>{recording.id}</code>
        </Detail>
        <Detail label="Session">
          <code>{recording.sessionId}</code>
        </Detail>
        <Detail label="Identity">{recording.identity ?? '—'}</Detail>
        <Detail label="Node">
          <code>{recording.nodeId ?? '—'}</code>
        </Detail>
        <Detail label="Format">{recording.format ?? '—'}</Detail>
        <Detail label="Status">
          <Badge tone={statusTone(recording.status)}>
            {recording.status ?? 'unknown'}
          </Badge>
        </Detail>
        <Detail label="WORM mode">
          <Badge tone={wormTone(recording.wormMode)}>
            {recording.wormMode ?? '—'}
          </Badge>
        </Detail>
        <Detail label="Size">{formatBytes(recording.sizeBytes)}</Detail>
        <Detail label="Legal hold">
          {held ? (
            <Badge tone="warn">On hold</Badge>
          ) : (
            <span className="muted">—</span>
          )}
        </Detail>
        <Detail label="Retention until">
          <Time value={recording.retentionUntil} />
        </Detail>
        {recording.prunedAt !== undefined && (
          <Detail label="Pruned">
            <Time value={recording.prunedAt} />
          </Detail>
        )}
        <Detail label="Started">
          <Time value={recording.startedAt} />
        </Detail>
        <Detail label="Ended">
          <Time value={recording.endedAt} />
        </Detail>
        <Detail label="Encryption key">
          {recording.encryptionKeyRef ?? '—'}
        </Detail>
        <Detail label="Hash-chain head">
          {recording.hashChainHead !== undefined ? (
            <code className="mono">{recording.hashChainHead}</code>
          ) : (
            '—'
          )}
        </Detail>
      </DetailList>

      {holdMessage !== undefined && (
        <p role="status" className="export-done">
          {holdMessage}
        </p>
      )}

      {holdOpen && (
        <ConfirmDialog
          title={held ? 'Release legal hold' : 'Place legal hold'}
          confirmLabel={held ? 'Release hold' : 'Place hold'}
          variant="primary"
          pending={legalHold.isPending}
          error={legalHold.error}
          onConfirm={submitHold}
          onClose={() => {
            setHoldOpen(false);
          }}
        >
          <p className="muted">
            {held
              ? 'Releasing the hold makes this recording subject to retention pruning and governance delete again.'
              : 'A held recording is exempt from retention pruning and governance delete in either WORM mode.'}
          </p>
          <TextareaField
            label="Reason"
            value={reason}
            onChange={setReason}
            rows={3}
            hint="Recorded in the audit trail."
          />
        </ConfirmDialog>
      )}

      {deleteOpen && (
        <ConfirmDialog
          title="Governance-delete recording"
          confirmLabel="Delete recording"
          pending={del.isPending}
          error={del.error}
          onConfirm={submitDelete}
          onClose={() => {
            setDeleteOpen(false);
          }}
        >
          <p className="muted">
            Deletes the encrypted object and marks the metadata pruned. Refused
            for a compliance-mode recording or one under legal hold.
          </p>
        </ConfirmDialog>
      )}
    </Dialog>
  );
}
