/**
 * In-memory bearer token (never localStorage/sessionStorage; XSS-exfiltratable).
 */
let bearer: string | undefined;

const listeners = new Set<() => void>();
let unauthorizedHandler: (() => void) | undefined;

export function getBearer(): string | undefined {
  return bearer;
}

export function setBearer(token: string | undefined): void {
  bearer = token;
  for (const l of listeners) l();
}

export function clearBearer(): void {
  setBearer(undefined);
}

export function subscribeBearer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setUnauthorizedHandler(fn: (() => void) | undefined): void {
  unauthorizedHandler = fn;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}
