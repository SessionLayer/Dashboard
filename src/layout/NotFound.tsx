import { Link } from '@tanstack/react-router';

export function NotFound() {
  return (
    <section className="panel" role="alert">
      <h1>Page not found</h1>
      <p className="muted">That screen does not exist.</p>
      <Link to="/" className="nav-link nav-link-active">
        Back to overview
      </Link>
    </section>
  );
}
