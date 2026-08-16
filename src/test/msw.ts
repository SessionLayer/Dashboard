import { HttpResponse } from 'msw';

import { CP_BASE_URL } from '../api/client';

type JsonBody = Parameters<typeof HttpResponse.json>[0];

export function cp(path: string): string {
  return `${CP_BASE_URL}${path}`;
}

export function ok(body: unknown, status = 200) {
  return HttpResponse.json(body as JsonBody, { status });
}

export function page(items: unknown[], nextCursor?: string) {
  const body = nextCursor !== undefined ? { items, nextCursor } : { items };
  return HttpResponse.json(body as JsonBody);
}

export function problem(status: number, title: string, detail?: string) {
  return HttpResponse.json(
    { type: 'about:blank', title, status, detail } as JsonBody,
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}
