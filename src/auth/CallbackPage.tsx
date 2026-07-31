import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../ui/Button';
import { LoadingState } from '../ui/States';
import { useAuth } from './AuthContext';

/**
 * OIDC redirect landing. Exchanges the authorization code for the bearer
 * (validating `state`), then routes into the dashboard. Runs exactly once — a
 * ref guards against React StrictMode's double-invoke, since the code is
 * single-use and the transient is consumed on read.
 */
export function CallbackPage() {
  const { completeCallback } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | undefined>(undefined);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    completeCallback(window.location.search)
      .then(() => navigate({ to: '/' }))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Sign-in could not complete');
      });
  }, [completeCallback, navigate]);

  if (error !== undefined) {
    return (
      <div className="login-screen">
        <section className="login-card panel" role="alert">
          <h1 className="login-title">Sign-in failed</h1>
          <p className="error">{error}</p>
          <Button
            variant="primary"
            onClick={() => {
              void navigate({ to: '/login' });
            }}
          >
            Try again
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <LoadingState label="Completing sign-in…" />
    </div>
  );
}
