export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function idempotencyHeader(key: string = newIdempotencyKey()): {
  'Idempotency-Key': string;
} {
  return { 'Idempotency-Key': key };
}
