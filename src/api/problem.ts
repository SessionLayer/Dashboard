import type { components } from './schema';

export type ProblemDetails = components['schemas']['ProblemDetails'];

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

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null;
}

/**
 * `T` may be `undefined` for 204 responses (delete/terminate) - callers treat
 * that as success.
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
