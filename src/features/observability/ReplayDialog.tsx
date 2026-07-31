import { useEffect, useState } from 'react';

import { Dialog, LoadingState, ProblemAlert } from '../../ui';
import { ProblemError } from '../../api/problem';
import { AsciicastError, type Asciicast } from '../../crypto/asciicast';
import { SlrecError } from '../../crypto/slrec';
import type { RecordingResource } from '../../api/types';
import type { CustomerKeyState } from './customerKey';
import { KeyInput } from './KeyInput';
import { loadReplayCast } from './replay';
import { ReplayPlayer } from './ReplayPlayer';

function DecryptError({ error }: { error: unknown }) {
  if (error instanceof ProblemError) return <ProblemAlert error={error} />;

  let message: string;
  if (error instanceof SlrecError) {
    message =
      error.code === 'decrypt-failed'
        ? 'Wrong key or corrupt recording — this key cannot decrypt this object.'
        : error.message;
  } else if (error instanceof AsciicastError) {
    message = 'The recording decrypted but is not a valid asciicast stream.';
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = 'The recording could not be replayed.';
  }
  return (
    <div className="state state-error" role="alert">
      <p className="state-title error">Replay failed</p>
      <p className="muted">{message}</p>
    </div>
  );
}

/**
 * Replays one recording end-to-end in the browser: request a signed URL, download
 * the still-encrypted object, decrypt it with the in-memory customer key, and
 * play it. The key never leaves this dialog.
 */
export function ReplayDialog({
  recording,
  keyState,
  onClose,
}: {
  recording: RecordingResource;
  keyState: CustomerKeyState;
  onClose: () => void;
}) {
  const { key } = keyState;
  const [cast, setCast] = useState<Asciicast | undefined>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (key === undefined) return;
    let cancelled = false;
    // The decrypt runs in an async function so state transitions happen off the
    // synchronous effect body. Plaintext stays in this dialog's local state
    // (cleared on unmount) — never a shared cache — per the §12.2 crown-jewels rule.
    const run = async () => {
      setLoading(true);
      setError(undefined);
      setCast(undefined);
      try {
        const c = await loadReplayCast(recording.id, key, recording.sizeBytes);
        if (!cancelled) {
          setCast(c);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e);
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [recording.id, key]);

  const title = `Replay — ${recording.identity ?? recording.sessionId}`;

  return (
    <Dialog title={title} onClose={onClose} size="wide">
      <div className="replay-dialog">
        <KeyInput keyState={keyState} />

        {key === undefined ? (
          <p className="muted">
            Load your customer private key above to decrypt and replay this
            recording.
          </p>
        ) : (
          <>
            {loading && <LoadingState label="Decrypting recording…" />}
            {error !== undefined && <DecryptError error={error} />}
            {cast !== undefined && <ReplayPlayer cast={cast} />}
          </>
        )}
      </div>
    </Dialog>
  );
}
