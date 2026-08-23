import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/**
 * A router `Link` that accepts a plain-string `to`. The nav model (`nav.ts`) is
 * data-driven, but TanStack Router types `to` as the known-route union. This one
 * localized cast bridges the two; the route tree still validates the target at
 * runtime (and tests cover every link).
 */
export function NavLink({
  to,
  children,
  className = 'nav-link',
  onNavigate,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      className={className}
      activeProps={{ className: `${className} nav-link-active` }}
      activeOptions={{ exact: to === '/' }}
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}
