import { Navigate } from '@tanstack/react-router';

import { useAuth } from '../auth/AuthContext';
import { AppShell } from './AppShell';

/** Route guard for the authenticated area: no bearer → bounce to /login. */
export function AuthedLayout() {
  const { status } = useAuth();
  if (status === 'unauthenticated') {
    return <Navigate to="/login" />;
  }
  return <AppShell />;
}
