import { HttpResponse } from 'msw';

import { CP_BASE_URL } from '../api/client';

type JsonBody = Parameters<typeof HttpResponse.json>[0];

/** Absolute URL for a Control Plane path (MSW matches on the full URL). */
export function cp(path: string): string {
  return `${CP_BASE_URL}${path}`;
}

/** A JSON 200 (or given status) success body. */
export function ok(body: unknown, status = 200) {
  return HttpResponse.json(body as JsonBody, { status });
}

/** A cursor page envelope, matching every `*Page`/`*List` contract schema. */
export function page(items: unknown[], nextCursor?: string) {
  const body = nextCursor !== undefined ? { items, nextCursor } : { items };
  return HttpResponse.json(body as JsonBody);
}

/** An RFC 9457 problem+json error response. */
export function problem(status: number, title: string, detail?: string) {
  return HttpResponse.json(
    { type: 'about:blank', title, status, detail } as JsonBody,
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
