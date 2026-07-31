import { describe, expect, it } from 'vitest';

import {
  importCustomerPrivateKey,
  parseHeader,
  unsealRecording,
  unsealToText,
} from './slrec';
import {
  CUSTOMER_PRIVATE_KEY_PKCS8_DER_HEX,
  hexToBytes,
  OBJECT_HEX,
  PLAINTEXT_UTF8,
} from './slrecGolden';

// Cross-language conformance (M15): `slrec.test.ts` only ever exercises
// production `unsealRecording` against objects sealed by the TEST-ONLY TS
// mirror (`../test/recordingFixture.ts`) -- the production decryptor has
// never before been run against a Rust-sealed object. `slrecGolden.ts` is
// sealed ONCE by the real Gateway `seal_to_customer`/`seal_frame` path
// (see `Gateway/gateway-core/tests/slrec_conformance.rs`); this file
// decrypts it through the production path here, closing that gap.

describe('SLREC1 cross-language conformance (M15)', () => {
  it('decrypts the Rust-sealed golden object via the production TS path', async () => {
    const object = hexToBytes(OBJECT_HEX);
    const key = await importCustomerPrivateKey(
      hexToBytes(CUSTOMER_PRIVATE_KEY_PKCS8_DER_HEX),
    );
    await expect(unsealToText(object, key)).resolves.toBe(PLAINTEXT_UTF8);
  });

  it('rejects the golden object with a flipped byte in the wrapped data key', async () => {
    const object = hexToBytes(OBJECT_HEX);
    const header = parseHeader(object);
    // Wrapped key lives inside the header, immediately following MAGIC(6) +
    // alg(1) + reserved(1) + ephLen(2) + ephemeralPublic + wrapNonce(12) +
    // wrapLen(2); computed from the parsed header rather than hard-coded so
    // this stays correct if ephemeral-key encoding length ever changes.
    const wrappedKeyOffset =
      6 + 1 + 1 + 2 + header.ephemeralPublic.length + 12 + 2;
    const lastWrappedKeyByte = wrappedKeyOffset + header.wrappedKey.length - 1;
    object[lastWrappedKeyByte] =
      ((object[lastWrappedKeyByte] ?? 0) ^ 0x01) & 0xff;

    const key = await importCustomerPrivateKey(
      hexToBytes(CUSTOMER_PRIVATE_KEY_PKCS8_DER_HEX),
    );
    // A flipped wrapped-key byte must be rejected outright, not silently
    // unwrap to a wrong data key that then "decrypts" frames into garbage.
    await expect(unsealRecording(object, key)).rejects.toMatchObject({
      code: 'decrypt-failed',
    });
  });

  it("rejects the golden object with a flipped byte in a frame's ciphertext", async () => {
    const object = hexToBytes(OBJECT_HEX);
    // The last byte of the object always falls inside the final frame's
    // ciphertext/tag (mirrors the Rust-side `golden_object_tamper_is_rejected`
    // and the existing `slrec.test.ts` tamper test).
    const last = object.length - 1;
    object[last] = ((object[last] ?? 0) ^ 0x01) & 0xff;

    const key = await importCustomerPrivateKey(
      hexToBytes(CUSTOMER_PRIVATE_KEY_PKCS8_DER_HEX),
    );
    await expect(unsealRecording(object, key)).rejects.toMatchObject({
      code: 'decrypt-failed',
    });
  });
});
