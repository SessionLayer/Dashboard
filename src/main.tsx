import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ProblemError } from './api/problem';
import { AuthProvider } from './auth/AuthContext';
import { router } from './router';
import './fonts.css';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry once, but never a 4xx (auth/permission/not-found/validation are
      // not transient — retrying doubles the burst and delays the real error).
      retry: (failureCount, error) => {
        if (
          error instanceof ProblemError &&
          error.status !== undefined &&
          error.status >= 400 &&
          error.status < 500
        ) {
          return false;
        }
        return failureCount < 1;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
