import { describe, expect, it } from 'vitest';

import {
  generateCustomerKeypair,
  sealAsciicast,
} from '../test/recordingFixture';
import {
  importCustomerPrivateKey,
  parseHeader,
  SlrecError,
  unsealRecording,
  unsealToText,
} from './slrec';

const CAST =
  '{"version":2,"width":80,"height":24,"timestamp":1700000000}\n' +
  '[0.10,"o","$ whoami\\r\\n"]\n' +
  '[0.20,"i","ls\\r"]\n' +
  '[0.30,"o","admin\\r\\n"]\n' +
  '[0.40,"m","sftp: GET /etc/hosts (312 bytes)"]\n';

describe('SLREC1 client-side unseal', () => {
  it('round-trips a single-frame recording to the exact asciicast bytes', async () => {
    const { spki, privateKeyPem } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST);
    const key = await importCustomerPrivateKey(privateKeyPem);
    expect(await unsealToText(object, key)).toBe(CAST);
  });

  it('round-trips a multi-frame recording (per-frame counter nonce + index AAD)', async () => {
    const { spki, privateKeyPem } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST, [20, 15, 30, 25]);
    const key = await importCustomerPrivateKey(privateKeyPem);
    expect(await unsealToText(object, key)).toBe(CAST);
  });

  it('accepts a DER (Uint8Array) private key as well as PEM', async () => {
    const { spki, pkcs8 } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST);
    const key = await importCustomerPrivateKey(pkcs8);
    expect(await unsealToText(object, key)).toBe(CAST);
  });

  it('fails closed with the WRONG customer key (ECDH → wrong KEK → GCM mismatch)', async () => {
    const sealed = await generateCustomerKeypair();
    const other = await generateCustomerKeypair();
    const object = await sealAsciicast(sealed.spki, CAST);
    const wrongKey = await importCustomerPrivateKey(other.privateKeyPem);
    await expect(unsealRecording(object, wrongKey)).rejects.toMatchObject({
      code: 'decrypt-failed',
    });
  });

  it('fails closed on a tampered object (flipped ciphertext byte breaks the tag)', async () => {
    const { spki, privateKeyPem } = await generateCustomerKeypair();
    const object = await sealAsciicast(spki, CAST);
    const last = object.length - 1;
    object[last] = ((object[last] ?? 0) ^ 0x01) & 0xff;
    const key = await importCustomerPrivateKey(privateKeyPem);
    await expect(unsealRecording(object, key)).rejects.toBeInstanceOf(
      SlrecError,
    );
  });

  it('rejects non-SLREC1 bytes as malformed', () => {
    expect(() => parseHeader(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(
      SlrecError,
    );
  });

  it('imports the customer private key as NON-extractable (cannot be serialized out)', async () => {
    const { privateKeyPem } = await generateCustomerKeypair();
    const key = await importCustomerPrivateKey(privateKeyPem);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', key)).rejects.toBeTruthy();
  });

  it('rejects a SEC1 EC PRIVATE KEY with an actionable message', async () => {
    const sec1 =
      '-----BEGIN EC PRIVATE KEY-----\nAAAA\n-----END EC PRIVATE KEY-----';
    await expect(importCustomerPrivateKey(sec1)).rejects.toMatchObject({
      code: 'unsupported-key',
    });
  });
});
