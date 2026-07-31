/**
 * A fresh RFC-shaped idempotency key for a mutating request (Design §13). The
 * Control Plane dedupes retried POSTs by this key, so a double-submit or a retry
 * after a dropped response never creates two resources. Generated per user
 * action; `crypto.randomUUID` is available in every target browser.
 */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** The `Idempotency-Key` header object for an openapi-fetch call's `params.header`. */
export function idempotencyHeader(key: string = newIdempotencyKey()): {
  'Idempotency-Key': string;
} {
  return { 'Idempotency-Key': key };
}
