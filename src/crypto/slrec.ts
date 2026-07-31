/**
 * Client-side unseal of a SessionLayer recording object (`SLREC1`), mirroring the Gateway
 * seal format (`gateway-core/src/ssh/recorder/seal.rs`) exactly so the browser can decrypt
 * a recording the platform itself cannot.
 *
 * The customer PRIVATE key never leaves this module's call stack: it is imported as a
 * non-extractable WebCrypto key and used only for `deriveBits`. It is never serialized,
 * sent, or persisted — the crown-jewels invariant (Design §12.2/§15).
 */

const MAGIC = new TextEncoder().encode('SLREC1');
const ALG_ECIES_P256 = 1;
const KEK_INFO = new TextEncoder().encode(
  'SessionLayer/recording/ECIES-P256-HKDF-SHA256/kek/v1',
);
const WRAP_AAD = new TextEncoder().encode(
  'SessionLayer/recording/data-key-wrap/v1',
);

export type SlrecErrorCode =
  | 'malformed' // truncated / bad magic — not a SLREC1 object
  | 'unsupported-key' // customer key not importable as PKCS#8 P-256
  | 'decrypt-failed'; // wrong key or tampered object (GCM tag mismatch)

export class SlrecError extends Error {
  readonly code: SlrecErrorCode;
  constructor(code: SlrecErrorCode, message: string) {
    super(message);
    this.name = 'SlrecError';
    this.code = code;
  }
}

interface SealHeader {
  algorithm: number;
  ephemeralPublic: Uint8Array;
  wrapNonce: Uint8Array;
  wrappedKey: Uint8Array;
  len: number;
}

/**
 * Copy a view into a standalone `ArrayBuffer`. WebCrypto's `BufferSource` params
 * require an `ArrayBuffer`-backed view (TS 5.7+ distinguishes SharedArrayBuffer),
 * and copying also detaches from any larger backing buffer of a subarray.
 */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

class Reader {
  private pos = 0;
  private readonly buf: Uint8Array;
  constructor(buf: Uint8Array) {
    this.buf = buf;
  }
  get offset(): number {
    return this.pos;
  }
  atEnd(): boolean {
    return this.pos >= this.buf.length;
  }
  take(n: number): Uint8Array {
    const end = this.pos + n;
    if (end > this.buf.length) {
      throw new SlrecError('malformed', 'unexpected end of sealed object');
    }
    const slice = this.buf.subarray(this.pos, end);
    this.pos = end;
    return slice;
  }
  u8(): number {
    const b = this.take(1);
    return new DataView(b.buffer, b.byteOffset, 1).getUint8(0);
  }
  u16(): number {
    const b = this.take(2);
    return new DataView(b.buffer, b.byteOffset, 2).getUint16(0, false);
  }
  u32(): number {
    const b = this.take(4);
    return new DataView(b.buffer, b.byteOffset, 4).getUint32(0, false);
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function parseHeader(object: Uint8Array): SealHeader {
  const r = new Reader(object);
  const magic = r.take(MAGIC.length);
  if (!bytesEqual(magic, MAGIC)) {
    throw new SlrecError('malformed', 'not a SLREC1 recording object');
  }
  const algorithm = r.u8();
  r.u8(); // reserved
  const ephLen = r.u16();
  const ephemeralPublic = r.take(ephLen);
  const wrapNonce = r.take(12);
  const wrapLen = r.u16();
  const wrappedKey = r.take(wrapLen);
  return {
    algorithm,
    ephemeralPublic: new Uint8Array(ephemeralPublic),
    wrapNonce: new Uint8Array(wrapNonce),
    wrappedKey: new Uint8Array(wrappedKey),
    len: r.offset,
  };
}

function stripPem(pem: string): { der: Uint8Array; kind: 'pkcs8' | 'sec1' } {
  const pkcs8 =
    /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(pem);
  const sec1 =
    /-----BEGIN EC PRIVATE KEY-----([\s\S]+?)-----END EC PRIVATE KEY-----/.exec(
      pem,
    );
  const body = pkcs8?.[1] ?? sec1?.[1];
  if (body === undefined) {
    throw new SlrecError(
      'unsupported-key',
      'expected a PEM-encoded EC private key',
    );
  }
  const b64 = body.replace(/\s+/g, '');
  const binary = atob(b64);
  const der = Uint8Array.from(binary, (c) => c.codePointAt(0) ?? 0);
  return { der, kind: pkcs8 !== null ? 'pkcs8' : 'sec1' };
}

/**
 * Import the customer's P-256 private key from PKCS#8 (PEM or DER) as a
 * non-extractable ECDH key. SEC1 (`BEGIN EC PRIVATE KEY`) is rejected with a
 * clear message — WebCrypto imports only PKCS#8 for EC; convert with
 * `openssl pkcs8 -topk8 -nocrypt`.
 */
export async function importCustomerPrivateKey(
  input: string | ArrayBuffer | Uint8Array,
): Promise<CryptoKey> {
  let der: Uint8Array;
  if (typeof input === 'string') {
    const parsed = stripPem(input);
    if (parsed.kind === 'sec1') {
      throw new SlrecError(
        'unsupported-key',
        'SEC1 "EC PRIVATE KEY" is not supported; convert to PKCS#8 (openssl pkcs8 -topk8 -nocrypt)',
      );
    }
    der = parsed.der;
  } else {
    der = input instanceof Uint8Array ? input : new Uint8Array(input);
  }
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      der.slice().buffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
  } catch {
    throw new SlrecError(
      'unsupported-key',
      'not a valid PKCS#8 P-256 private key',
    );
  }
}

async function deriveDataKey(
  header: SealHeader,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  let ephPub: CryptoKey;
  try {
    ephPub = await crypto.subtle.importKey(
      'raw',
      header.ephemeralPublic.slice().buffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
  } catch {
    throw new SlrecError('malformed', 'invalid ephemeral public key');
  }

  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephPub },
    privateKey,
    256,
  );

  const info = new Uint8Array(KEK_INFO.length + header.ephemeralPublic.length);
  info.set(KEK_INFO, 0);
  info.set(header.ephemeralPublic, KEK_INFO.length);
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveBits',
  ]);
  // Empty salt matches the Rust `Hkdf::new(None, ...)` (salt = HashLen zeros).
  const kekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info },
    ikm,
    256,
  );
  const kek = await crypto.subtle.importKey('raw', kekBits, 'AES-GCM', false, [
    'decrypt',
  ]);

  let raw: ArrayBuffer;
  try {
    raw = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(header.wrapNonce),
        additionalData: toArrayBuffer(WRAP_AAD),
        tagLength: 128,
      },
      kek,
      toArrayBuffer(header.wrappedKey),
    );
  } catch {
    // Wrong customer key → different ECDH secret → wrong KEK → GCM tag mismatch.
    throw new SlrecError(
      'decrypt-failed',
      'wrong customer key for this recording',
    );
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}

function counterNonce(index: number): ArrayBuffer {
  const n = new Uint8Array(12);
  new DataView(n.buffer).setBigUint64(4, BigInt(index));
  return n.buffer;
}

function frameAad(index: number): ArrayBuffer {
  const a = new Uint8Array(8);
  new DataView(a.buffer).setBigUint64(0, BigInt(index));
  return a.buffer;
}

/**
 * Decrypt a full SLREC1 object with the customer private key, returning the original
 * asciicast v2 UTF-8 bytes.
 *
 * Tamper-evidence at the cipher layer covers a WRONG KEY, a corrupted frame, and frame
 * REORDER/INTERIOR-DELETE (each frame binds its index as AAD). It does NOT cover dropping
 * WHOLE TRAILING frames: the format has no frame count/terminator, so a tail-truncated
 * object still decrypts cleanly. The caller must guard the fetch path against truncation
 * (the replay/export pipeline checks the fetched length against the CP-reported
 * `sizeBytes`); full hash-chain verification against `hashChainHead` is a follow-up.
 */
export async function unsealRecording(
  object: Uint8Array,
  privateKey: CryptoKey,
): Promise<Uint8Array> {
  const header = parseHeader(object);
  if (header.algorithm !== ALG_ECIES_P256) {
    throw new SlrecError(
      'unsupported-key',
      `unsupported seal algorithm ${String(header.algorithm)}`,
    );
  }
  const dataKey = await deriveDataKey(header, privateKey);

  const r = new Reader(object.subarray(header.len));
  const parts: Uint8Array[] = [];
  let index = 0;
  while (!r.atEnd()) {
    const ctLen = r.u32();
    const ct = r.take(ctLen);
    let pt: ArrayBuffer;
    try {
      pt = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: counterNonce(index),
          additionalData: frameAad(index),
          tagLength: 128,
        },
        dataKey,
        toArrayBuffer(ct),
      );
    } catch {
      throw new SlrecError(
        'decrypt-failed',
        'recording frame failed to decrypt (tampered or truncated)',
      );
    }
    parts.push(new Uint8Array(pt));
    index += 1;
  }

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Convenience: unseal directly to the decoded asciicast text. */
export async function unsealToText(
  object: Uint8Array,
  privateKey: CryptoKey,
): Promise<string> {
  return new TextDecoder().decode(await unsealRecording(object, privateKey));
}
