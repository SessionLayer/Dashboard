import type { ErrorComponentProps } from '@tanstack/react-router';

export function RouteError({ error }: ErrorComponentProps) {
  return (
    <section className="panel" role="alert">
      <h1>Something went wrong</h1>
      <p className="error">
        {error instanceof Error ? error.message : 'Unexpected error'}
      </p>
    </section>
  );
}
