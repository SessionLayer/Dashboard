import { beforeAll, describe, expect, it } from 'vitest';

import {
  fingerprintSha256,
  fingerprintsMatch,
  inspectSubmittedKey,
  verifySealAlgorithm,
} from './publicKey';

function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function exportSpki(
  algorithm: EcKeyGenParams | RsaHashedKeyGenParams,
  usages: KeyUsage[],
): Promise<Uint8Array> {
  const pair = await crypto.subtle.generateKey(algorithm, true, usages);
  return new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
}

// A real SEC1 `ECPrivateKey` (openssl ecparam -genkey -outform DER). WebCrypto
// cannot produce this encoding, and it is exactly the blob an operator gets from
// the older openssl invocations, so the refusal is tested against the real thing.
const SEC1_PRIVATE_KEY =
  'MHcCAQEEIGG+eMMlmwc759MGgI16uokbFypZngefT0K3653hm8nuoAoGCCqGSM49AwEHoUQDQgAE9gAjXBubG6rVrDkl3jQdd2dgR8Mb6MrtwRqfNqWns4Ps9JbpOG4yvBZ56RD6f4kZa6MOhv5QjUcyFGdNc/aUCA==';

let p256Spki: Uint8Array;
let p384Spki: Uint8Array;
let rsaSpki: Uint8Array;
let pkcs8: Uint8Array;

beforeAll(async () => {
  p256Spki = await exportSpki({ name: 'ECDH', namedCurve: 'P-256' }, [
    'deriveBits',
  ]);
  p384Spki = await exportSpki({ name: 'ECDH', namedCurve: 'P-384' }, [
    'deriveBits',
  ]);
  rsaSpki = await exportSpki(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    ['encrypt', 'decrypt'],
  );
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', pair.privateKey),
  );
});

describe('inspectSubmittedKey', () => {
  it('accepts a base64 DER P-256 SubjectPublicKeyInfo', () => {
    const result = inspectSubmittedKey(b64(p256Spki));
    expect(result.ok).toBe(true);
  });

  it('tolerates the line breaks a terminal paste carries', () => {
    const wrapped = b64(p256Spki).replace(/(.{40})/g, '$1\n');
    expect(inspectSubmittedKey(wrapped).ok).toBe(true);
  });

  it('refuses a PKCS#8 private key as private key material', () => {
    const result = inspectSubmittedKey(b64(pkcs8));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.privateKeyMaterial).toBe(true);
    expect(result.message).toMatch(/private key material/i);
    expect(result.message).toMatch(/only the public half/i);
  });

  it('refuses a SEC1 EC private key as private key material', () => {
    const result = inspectSubmittedKey(SEC1_PRIVATE_KEY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.privateKeyMaterial).toBe(true);
  });

  it('refuses a PEM private key on the marker alone, before any decode', () => {
    const pem = `-----BEGIN PRIVATE KEY-----\n${b64(pkcs8)}\n-----END PRIVATE KEY-----`;
    const result = inspectSubmittedKey(pem);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.privateKeyMaterial).toBe(true);
  });

  it('refuses PEM armour around a public key, pointing at the base64 body', () => {
    const pem = `-----BEGIN PUBLIC KEY-----\n${b64(p256Spki)}\n-----END PUBLIC KEY-----`;
    const result = inspectSubmittedKey(pem);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.privateKeyMaterial).toBe(false);
    expect(result.message).toMatch(/PEM armour/i);
  });

  it('refuses key material that only the ASN.1 shape betrays', () => {
    const result = inspectSubmittedKey(b64(pkcs8).replace(/\s/g, ''));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.privateKeyMaterial).toBe(true);
  });

  it('rejects non-base64 input', () => {
    const result = inspectSubmittedKey('not a key!!');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/valid base64/i);
    expect(result.privateKeyMaterial).toBe(false);
  });

  it('rejects bytes that are not a SubjectPublicKeyInfo', () => {
    const result = inspectSubmittedKey(b64(new Uint8Array([1, 2, 3, 4, 5])));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/SubjectPublicKeyInfo/);
  });

  it('rejects a key larger than the 8 KiB the API accepts', () => {
    const oversize = new Uint8Array(9000);
    oversize[0] = 0x30;
    oversize[1] = 0x82;
    const result = inspectSubmittedKey(b64(oversize));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/8192/);
  });

  it('treats empty input as nothing pasted yet', () => {
    const result = inspectSubmittedKey('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.privateKeyMaterial).toBe(false);
  });
});

describe('verifySealAlgorithm', () => {
  it('accepts a P-256 key for ecies_p256', async () => {
    await expect(
      verifySealAlgorithm(p256Spki, 'ecies_p256'),
    ).resolves.toBeUndefined();
  });

  it('rejects a P-384 key submitted as ecies_p256', async () => {
    await expect(verifySealAlgorithm(p384Spki, 'ecies_p256')).resolves.toMatch(
      /P-256/,
    );
  });

  it('rejects an RSA key submitted as ecies_p256', async () => {
    await expect(verifySealAlgorithm(rsaSpki, 'ecies_p256')).resolves.toMatch(
      /EC public key/,
    );
  });

  it('accepts an RSA key for rsa_oaep_sha256', async () => {
    await expect(
      verifySealAlgorithm(rsaSpki, 'rsa_oaep_sha256'),
    ).resolves.toBeUndefined();
  });

  it('rejects a P-256 key submitted as rsa_oaep_sha256', async () => {
    await expect(
      verifySealAlgorithm(p256Spki, 'rsa_oaep_sha256'),
    ).resolves.toMatch(/RSA public key/);
  });
});

describe('fingerprintSha256', () => {
  it('is lowercase hex over the DER, matching the API form', async () => {
    const fp = await fingerprintSha256(p256Spki);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    await expect(fingerprintSha256(p256Spki)).resolves.toBe(fp);
    await expect(fingerprintSha256(p384Spki)).resolves.not.toBe(fp);
  });
});

describe('fingerprintsMatch', () => {
  it('ignores case, whitespace and colon grouping', () => {
    expect(fingerprintsMatch('AB:CD ef', 'abcdef')).toBe(true);
    expect(fingerprintsMatch('  abcdef  ', 'abcdef')).toBe(true);
  });

  it('does not treat empty input as a match', () => {
    expect(fingerprintsMatch('', '')).toBe(false);
    expect(fingerprintsMatch('   ', 'abcdef')).toBe(false);
  });

  it('rejects a different fingerprint', () => {
    expect(fingerprintsMatch('abcdef', 'abcde0')).toBe(false);
  });
});
