import { Outlet, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import {
  useActiveLocks,
  useBreakglassActivations,
  useNodes,
  usePendingJit,
} from '../features/overview/queries';
import { Button } from '../ui/Button';
import { ControlPlaneVersion } from './ControlPlaneVersion';
import { DensityToggle } from './density';
import { NAV_SECTIONS, type NavItem } from './nav';
import { NavLink } from './NavLink';

function useNavBadges(): Record<string, number> {
  const nodes = useNodes();
  const locks = useActiveLocks();
  const jit = usePendingJit();
  const breakglass = useBreakglassActivations();

  return {
    quarantinedNodes: (nodes.data ?? []).filter(
      (n) => n.status === 'quarantined',
    ).length,
    activeLocks: (locks.data ?? []).length,
    pendingJit: (jit.data ?? []).length,
    unreviewedBg: (breakglass.data ?? []).filter(
      (a) => a.reviewStatus === 'pending',
    ).length,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const chars = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [name];
  return chars
    .map((p) => p?.[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function currentTitle(pathname: string): { title: string; path: string } {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      const match =
        item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
      if (match)
        return { title: item.label, path: item.to === '/' ? '/v1' : item.to };
    }
  }
  return { title: 'SessionLayer', path: pathname };
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const badges = useNavBadges();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { title, path } = currentTitle(pathname);
  const closeNav = () => {
    setNavOpen(false);
  };

  const who = user?.name ?? user?.email ?? user?.subject ?? 'Signed in';

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <div className="app-brand-row">
          <span className="app-logo" aria-hidden="true">
            &gt;_
          </span>
          <div>
            <div className="app-brand-name">SessionLayer</div>
            <div className="app-env-label">control plane</div>
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            onClick={() => {
              setNavOpen((o) => !o);
            }}
          >
            <span aria-hidden="true">{navOpen ? '✕' : '☰'}</span>
          </button>
        </div>
        <nav className="app-nav" aria-label="Primary" onClick={closeNav}>
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.title ?? `group-${String(i)}`}>
              {section.title !== undefined && (
                <p className="nav-section-title">{section.title}</p>
              )}
              {section.items.map((item: NavItem) => {
                const count =
                  item.badgeKey !== undefined
                    ? (badges[item.badgeKey] ?? 0)
                    : 0;
                return (
                  <NavLink key={item.to} to={item.to}>
                    <span>{item.label}</span>
                    {count > 0 && <span className="nav-badge">{count}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="app-sidebar-foot">
          <span className="app-status-dot" aria-hidden="true" />
          <ControlPlaneVersion />
        </div>
      </aside>

      <div className="app-main-col">
        <header className="app-header">
          <div className="app-header-title">
            <span className="app-header-title-text">{title}</span>
            <span className="app-header-path">{path}</span>
          </div>
          <div className="app-header-right">
            <DensityToggle />
            <div className="user-chip" title={user?.subject ?? ''}>
              <span className="user-avatar" aria-hidden="true">
                {initials(who)}
              </span>
              <span className="user-email">{who}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={logout}>
              Sign out
            </Button>
          </div>
        </header>

        <main id="main" className="app-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
