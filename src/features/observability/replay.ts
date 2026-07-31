/**
 * The platform never sees plaintext and never sees the private key (Design §12.2).
 */

import { api } from '../../api/client';
import { unwrap } from '../../api/problem';
import { idempotencyHeader } from '../../api/idempotency';
import { parseAsciicast, type Asciicast } from '../../crypto/asciicast';
import { unsealRecording } from '../../crypto/slrec';
import type { SignedUrl } from '../../api/types';

/**
 * Fails closed on silent truncation (hash-chain verification is deferred).
 */
const OBJECT_FETCH_TIMEOUT_MS = 60_000;

async function fetchObjectBytes(
  signed: SignedUrl,
  expectedSize: number | undefined,
  timeoutMs: number = OBJECT_FETCH_TIMEOUT_MS,
): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    const resp = await fetch(signed.url, {
      method: signed.method,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      throw new Error(
        `Could not download the recording object (HTTP ${String(resp.status)}).`,
      );
    }
    bytes = new Uint8Array(await resp.arrayBuffer());
  } catch (e) {
    if (
      e instanceof Error &&
      (e.name === 'TimeoutError' || e.name === 'AbortError')
    ) {
      throw new Error(
        `Recording download timed out after ${String(Math.round(timeoutMs / 1000))}s (object store unreachable).`,
        { cause: e },
      );
    }
    throw e;
  }
  if (expectedSize !== undefined && bytes.length !== expectedSize) {
    throw new Error(
      `Recording integrity check failed: object is ${String(bytes.length)} bytes, expected ${String(expectedSize)} (truncated or tampered).`,
    );
  }
  return bytes;
}

export interface ReplayOptions {
  timeoutMs?: number;
}

export async function loadReplayCast(
  recordingId: string,
  key: CryptoKey,
  expectedSize?: number,
  opts?: ReplayOptions,
): Promise<Asciicast> {
  const signed = unwrap(
    await api.POST('/v1/recordings/{recordingId}/replay', {
      params: { path: { recordingId }, header: idempotencyHeader() },
    }),
  );
  const bytes = await fetchObjectBytes(signed, expectedSize, opts?.timeoutMs);
  const plaintext = await unsealRecording(bytes, key);
  return parseAsciicast(new TextDecoder().decode(plaintext));
}

export async function loadExportBytes(
  recordingId: string,
  key: CryptoKey,
  expectedSize?: number,
  opts?: ReplayOptions,
): Promise<Uint8Array> {
  const signed = unwrap(
    await api.POST('/v1/recordings/{recordingId}/export', {
      params: { path: { recordingId }, header: idempotencyHeader() },
    }),
  );
  const bytes = await fetchObjectBytes(signed, expectedSize, opts?.timeoutMs);
  return unsealRecording(bytes, key);
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/x-asciicast',
  });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
