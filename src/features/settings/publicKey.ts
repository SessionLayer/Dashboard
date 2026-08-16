/**
 * Client-side vetting of a submitted recording customer key.
 *
 * The Control Plane is the authority — it re-runs every one of these checks and
 * answers 422. This module exists so the operator learns *before* submitting
 * that they pasted the wrong half of the key pair: a private key must never
 * leave the machine that generated it, and a UI that forwards it to the server
 * to be told "no" has already leaked it over the wire.
 */

import type { RecordingKeySealAlgorithm } from '../../api/types';

export type SealAlgorithm = RecordingKeySealAlgorithm;

/** The API caps the submitted key at 8 KiB; reject locally at the same bound. */
export const MAX_KEY_BYTES = 8192;

export type KeyCheck =
  | { ok: true; der: Uint8Array }
  | { ok: false; message: string; privateKeyMaterial: boolean };

function reject(message: string, privateKeyMaterial = false): KeyCheck {
  return { ok: false, message, privateKeyMaterial };
}

const PRIVATE_KEY_MESSAGE =
  'That is private key material. Only the public half is ever stored, and the private half must stay offline — the platform must not be able to decrypt recordings. Submit the base64 DER SubjectPublicKeyInfo instead.';

function containsPrivateKeyMarker(text: string): boolean {
  return /PRIVATE KEY/i.test(text);
}

function decodeAscii(bytes: Uint8Array): string {
  return Array.from(bytes, (b) =>
    b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ' ',
  ).join('');
}

function decodeBase64(text: string): Uint8Array | undefined {
  const compact = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length === 0) {
    return undefined;
  }
  try {
    const binary = atob(compact);
    return Uint8Array.from(binary, (c) => c.codePointAt(0) ?? 0);
  } catch {
    return undefined;
  }
}

/**
 * The tag of the first element inside a DER SEQUENCE, or `undefined` when the
 * input is not a definite-length SEQUENCE. A SubjectPublicKeyInfo opens with a
 * nested SEQUENCE (the AlgorithmIdentifier); PKCS#8 `PrivateKeyInfo` and SEC1
 * `ECPrivateKey` both open with an INTEGER version, which is what makes this
 * two-byte peek enough to tell a public key from a private one.
 */
function firstInnerTag(der: Uint8Array): number | undefined {
  if (der[0] !== 0x30) return undefined;
  const lengthByte = der[1];
  if (lengthByte === undefined || lengthByte === 0x80) return undefined;
  const offset = lengthByte > 0x80 ? 2 + (lengthByte & 0x7f) : 2;
  return der[offset];
}

export function inspectSubmittedKey(raw: string): KeyCheck {
  const text = raw.trim();
  if (text === '') return reject('Paste the base64 DER public key.');

  if (containsPrivateKeyMarker(text)) return reject(PRIVATE_KEY_MESSAGE, true);
  if (/-{3,}\s*BEGIN /.test(text) || /\bBEGIN [A-Z]/.test(text)) {
    return reject(
      'PEM armour is not accepted here. Paste the base64 body only — the DER SubjectPublicKeyInfo, without the BEGIN/END lines.',
    );
  }

  const der = decodeBase64(text);
  if (der === undefined) {
    return reject(
      'That is not valid base64. Paste the DER key, base64-encoded.',
    );
  }
  if (der.length > MAX_KEY_BYTES) {
    return reject(
      `That key is ${String(der.length)} bytes; the maximum accepted is ${String(MAX_KEY_BYTES)}.`,
    );
  }
  if (containsPrivateKeyMarker(decodeAscii(der))) {
    return reject(PRIVATE_KEY_MESSAGE, true);
  }

  const inner = firstInnerTag(der);
  if (inner === 0x02) return reject(PRIVATE_KEY_MESSAGE, true);
  if (inner !== 0x30) {
    return reject(
      'That is not a SubjectPublicKeyInfo. Export the public key with `openssl pkey -pubout -outform DER` and base64 it.',
    );
  }
  return { ok: true, der };
}

export async function verifySealAlgorithm(
  der: Uint8Array,
  algorithm: SealAlgorithm,
): Promise<string | undefined> {
  const spki = der.slice().buffer;
  try {
    if (algorithm === 'ecies_p256') {
      await crypto.subtle.importKey(
        'spki',
        spki,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      );
    } else {
      await crypto.subtle.importKey(
        'spki',
        spki,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt'],
      );
    }
    return undefined;
  } catch {
    return algorithm === 'ecies_p256'
      ? 'That key is not an EC public key on P-256, which ecies_p256 requires.'
      : 'That key is not an RSA public key, which rsa_oaep_sha256 requires.';
  }
}

export async function fingerprintSha256(der: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', der.slice().buffer);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export function normalizeFingerprint(value: string): string {
  return value.trim().toLowerCase().replace(/[\s:]/g, '');
}

export function fingerprintsMatch(a: string, b: string): boolean {
  const left = normalizeFingerprint(a);
  return left !== '' && left === normalizeFingerprint(b);
}
