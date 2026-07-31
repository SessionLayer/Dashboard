import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { assertHttpsBasesPlugin } from './deploy/httpsGuard';

// App build/dev config. Vitest reads its own config from vitest.config.ts so the
// two concerns stay separate and the app bundle never pulls in test tooling. The
// https guard fails a production build that points a credential-bearing endpoint
// at cleartext http (deploy/httpsGuard.ts; runtime backstop in src/api/client.ts).
export default defineConfig({
  plugins: [react(), assertHttpsBasesPlugin()],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
