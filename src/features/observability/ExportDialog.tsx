import { useEffect, useRef, useState } from 'react';

import { Button, Dialog, LoadingState } from '../../ui';
import { ProblemError } from '../../api/problem';
import { SlrecError } from '../../crypto/slrec';
import type { RecordingResource } from '../../api/types';
import type { CustomerKeyState } from './customerKey';
import { KeyInput } from './KeyInput';
import { downloadBytes, loadExportBytes } from './replay';

function exportErrorMessage(error: unknown): string {
  if (error instanceof ProblemError) return error.message;
  if (error instanceof SlrecError) {
    return error.code === 'decrypt-failed'
      ? 'Wrong key or corrupt recording — this key cannot decrypt this object.'
      : error.message;
  }
  if (error instanceof Error) return error.message;
  return 'The recording could not be exported.';
}

/**
 * Export a recording as a decrypted `.cast` file. The signed object is fetched
 * and decrypted in the browser; only the operator's machine ever sees plaintext.
 */
export function ExportDialog({
  recording,
  keyState,
  onClose,
}: {
  recording: RecordingResource;
  keyState: CustomerKeyState;
  onClose: () => void;
}) {
  const { key } = keyState;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [done, setDone] = useState(false);

  // Guard against a close mid-decrypt: don't trigger a surprise download or set
  // state after the dialog has unmounted.
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const run = () => {
    if (key === undefined) return;
    setBusy(true);
    setError(undefined);
    setDone(false);
    void loadExportBytes(recording.id, key, recording.sizeBytes)
      .then((bytes) => {
        if (cancelled.current) return;
        downloadBytes(bytes, `${recording.id}.cast`);
        setDone(true);
      })
      .catch((e: unknown) => {
        if (!cancelled.current) setError(e);
      })
      .finally(() => {
        if (!cancelled.current) setBusy(false);
      });
  };

  return (
    <Dialog
      title="Export recording"
      onClose={onClose}
      size="wide"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={run}
            disabled={key === undefined || busy}
          >
            {busy ? 'Decrypting…' : 'Download .cast'}
          </Button>
        </>
      }
    >
      <div className="replay-dialog">
        <KeyInput keyState={keyState} />
        <p className="muted">
          Exports the decrypted asciicast to your machine as{' '}
          <code>{recording.id}.cast</code>. Decryption happens in this browser;
          the key is never uploaded.
        </p>
        {busy && <LoadingState label="Decrypting recording…" />}
        {done && !busy && error === undefined && (
          <p className="export-done">Downloaded {recording.id}.cast</p>
        )}
        {error !== undefined && (
          <div className="state state-error" role="alert">
            <p className="state-title error">Export failed</p>
            <p className="muted">{exportErrorMessage(error)}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
