/**
 * TEST-ONLY: seals an asciicast into a SLREC1 object (mirror of slrec.ts encrypt).
 */

const MAGIC = new TextEncoder().encode('SLREC1');
const ALG_ECIES_P256 = 1;
const KEK_INFO = new TextEncoder().encode(
  'SessionLayer/recording/ECIES-P256-HKDF-SHA256/kek/v1',
);
const WRAP_AAD = new TextEncoder().encode(
  'SessionLayer/recording/data-key-wrap/v1',
);

export interface CustomerKeypair {
  spki: Uint8Array;
  privateKeyPem: string;
  pkcs8: Uint8Array;
}

function toPem(der: Uint8Array, label: string): string {
  let binary = '';
  for (const b of der) binary += String.fromCharCode(b);
  const b64 = btoa(binary)
    .replace(/(.{64})/g, '$1\n')
    .trimEnd();
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

export async function generateCustomerKeypair(): Promise<CustomerKeypair> {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const spki = new Uint8Array(
    await crypto.subtle.exportKey('spki', kp.publicKey),
  );
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', kp.privateKey),
  );
  return { spki, pkcs8, privateKeyPem: toPem(pkcs8, 'PRIVATE KEY') };
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

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export async function sealAsciicast(
  spki: Uint8Array,
  text: string,
  chunkSizes?: number[],
): Promise<Uint8Array> {
  const plaintext = new TextEncoder().encode(text);

  const rawDataKey = crypto.getRandomValues(new Uint8Array(32));
  const dataKey = await crypto.subtle.importKey(
    'raw',
    rawDataKey.slice().buffer,
    'AES-GCM',
    false,
    ['encrypt'],
  );

  const customerPub = await crypto.subtle.importKey(
    'spki',
    spki.slice().buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const eph = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const ephPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', eph.publicKey),
  );
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: customerPub },
    eph.privateKey,
    256,
  );
  const info = new Uint8Array(KEK_INFO.length + ephPubRaw.length);
  info.set(KEK_INFO, 0);
  info.set(ephPubRaw, KEK_INFO.length);
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveBits',
  ]);
  const kekBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info },
    ikm,
    256,
  );
  const kek = await crypto.subtle.importKey('raw', kekBits, 'AES-GCM', false, [
    'encrypt',
  ]);

  const wrapNonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(wrapNonce),
        additionalData: toArrayBuffer(WRAP_AAD),
        tagLength: 128,
      },
      kek,
      toArrayBuffer(rawDataKey),
    ),
  );

  const header = concat([
    MAGIC,
    Uint8Array.from([ALG_ECIES_P256, 0]),
    Uint8Array.from([(ephPubRaw.length >> 8) & 0xff, ephPubRaw.length & 0xff]),
    ephPubRaw,
    wrapNonce,
    Uint8Array.from([(wrapped.length >> 8) & 0xff, wrapped.length & 0xff]),
    wrapped,
  ]);

  const chunks: Uint8Array[] = [];
  if (chunkSizes === undefined) {
    chunks.push(plaintext);
  } else {
    let off = 0;
    for (const size of chunkSizes) {
      chunks.push(plaintext.subarray(off, off + size));
      off += size;
    }
    if (off < plaintext.length) chunks.push(plaintext.subarray(off));
  }

  const frames: Uint8Array[] = [header];
  for (const [i, chunk] of chunks.entries()) {
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: counterNonce(i),
          additionalData: frameAad(i),
          tagLength: 128,
        },
        dataKey,
        toArrayBuffer(chunk),
      ),
    );
    const lenPrefix = new Uint8Array(4);
    new DataView(lenPrefix.buffer).setUint32(0, ct.length);
    frames.push(lenPrefix, ct);
  }
  return concat(frames);
}
