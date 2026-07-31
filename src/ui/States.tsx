import type { ReactNode } from 'react';

import { ProblemError } from '../api/problem';

/** An accessible busy indicator. */
export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-live="polite">
      <span className="spinner-dot" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <Spinner label={label} />
      <p className="muted">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {hint !== undefined && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}

function problemMessage(error: unknown): {
  title: string;
  detail: string | undefined;
  status: number | undefined;
} {
  if (error instanceof ProblemError) {
    return {
      title: error.problem?.title ?? error.message,
      detail: error.problem?.detail,
      status: error.status,
    };
  }
  if (error instanceof Error) {
    return { title: error.message, detail: undefined, status: undefined };
  }
  return { title: 'Unexpected error', detail: undefined, status: undefined };
}

/**
 * Renders an error as an accessible alert. RFC 9457 problem+json is surfaced as
 * title + detail; a `403` reads as an authorization message (the server is the
 * gate). Never dumps raw bodies or secrets.
 */
export function ProblemAlert({ error }: { error: unknown }) {
  const { title, detail, status } = problemMessage(error);
  const forbidden = status === 403;
  return (
    <div className="state state-error" role="alert">
      <p className="state-title error">{forbidden ? 'Not permitted' : title}</p>
      <p className="muted">
        {forbidden
          ? 'Your account lacks the platform permission for this action.'
          : (detail ?? (status !== undefined ? `HTTP ${String(status)}` : ''))}
      </p>
    </div>
  );
}

/** Inline list wrapper: pending → spinner, error → alert, else children. */
export function AsyncList({
  isPending,
  isError,
  error,
  isEmpty,
  emptyTitle,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyTitle: string;
  children: ReactNode;
}) {
  if (isPending) return <LoadingState />;
  if (isError) return <ProblemAlert error={error} />;
  if (isEmpty) return <EmptyState title={emptyTitle} />;
  return <>{children}</>;
}
