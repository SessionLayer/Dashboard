import { Navigate } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '../ui/Button';
import { useAuth } from './AuthContext';

/**
 * The unauthenticated landing. Starts the OIDC authorization-code + PKCE flow
 * (full-page redirect to the IdP). Already-authenticated visitors are sent to the
 * dashboard. No credentials are ever entered here — the IdP owns authentication.
 */
export function LoginPage() {
  const { status, configured, login } = useAuth();
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/" />;
  }

  const onSignIn = () => {
    setError(undefined);
    setBusy(true);
    login().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      setBusy(false);
    });
  };

  return (
    <div className="login-screen">
      <div className="login-wrap">
        <div className="login-brand-row">
          <span className="login-logo" aria-hidden="true">
            &gt;_
          </span>
          <div>
            <div className="login-brand-name">SessionLayer</div>
            <div className="login-env">control plane</div>
          </div>
        </div>
        <section className="login-card" aria-labelledby="login-title">
          <h1 id="login-title" className="login-title">
            Sign in to the Control Plane
          </h1>
          <p className="login-subtitle">
            Human access is federated through your identity provider.
          </p>
          {configured ? (
            <Button variant="primary" onClick={onSignIn} disabled={busy}>
              {busy ? 'Redirecting…' : 'Continue with SSO (OIDC)'}
            </Button>
          ) : (
            <p className="error" role="alert">
              OIDC is not configured. Set <code>VITE_OIDC_ISSUER</code> (and
              client id / endpoints) at build time.
            </p>
          )}
          {error !== undefined && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        <p className="login-footnote">
          Machine consumers authenticate at{' '}
          <code className="mono">/v1/oauth2/token</code> with private_key_jwt or
          mTLS. OTP and pinned-key shortcuts are admin-issued — see Pins &amp;
          OTP.
        </p>
      </div>
    </div>
  );
}
