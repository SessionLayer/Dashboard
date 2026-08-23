import { Navigate } from '@tanstack/react-router';

import { useAuth } from '../auth/AuthContext';
import { AppShell } from './AppShell';

export function AuthedLayout() {
  const { status } = useAuth();
  if (status === 'unauthenticated') {
    return <Navigate to="/login" />;
  }
  return <AppShell />;
}
