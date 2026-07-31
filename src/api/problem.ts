import type { components } from './schema';

export type ProblemDetails = components['schemas']['ProblemDetails'];

/**
 * A failed Control Plane call carrying the HTTP status and the parsed RFC 9457
 * problem+json body, so the UI can render a useful (but non-leaking) message.
 * Every data path throws this on error; screens surface it via `<ProblemAlert>`.
 */
export class ProblemError extends Error {
  readonly status: number | undefined;
  readonly problem: ProblemDetails | undefined;

  constructor(status: number | undefined, problem: ProblemDetails | undefined) {
    super(
      problem?.title ??
        problem?.detail ??
        `Control Plane request failed${status !== undefined ? ` (HTTP ${String(status)})` : ''}`,
    );
    this.name = 'ProblemError';
    this.status = status;
    this.problem = problem;
  }

  /** True when the server rejected the action as unauthorized (RBAC is the gate). */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** True when the caller must re-authenticate. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True when optimistic concurrency lost (stale `version`). */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalize an openapi-fetch `{ data, error, response }` result to the success
 * payload, throwing {@link ProblemError} otherwise. `T` may be `undefined` for
 * 204 responses (delete/terminate) — callers treat that as success.
 */
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  const { data, error, response } = result;
  if (response.ok && error === undefined) {
    return data as T;
  }
  throw new ProblemError(
    response.status,
    isProblemDetails(error) ? error : undefined,
  );
}
