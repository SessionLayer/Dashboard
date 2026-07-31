import type { ErrorComponentProps } from '@tanstack/react-router';

/**
 * Router-level error boundary UI. A render-time throw (e.g. a breached or buggy
 * Control Plane returns a 200 whose body is missing fields the UI dereferences)
 * degrades to this inline message instead of unmounting the tree into a blank
 * screen.
 */
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
