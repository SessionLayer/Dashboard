import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit/component tests run in jsdom with Testing Library + MSW. The API is always
// mocked here (no live Control Plane is wired); see src/test/.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Playwright specs live under e2e/ and are driven by playwright.config.ts, not
    // Vitest. Excluding them here keeps `vitest run` from trying to execute them.
    exclude: ['node_modules', 'dist', 'e2e', '.playwright'],
  },
});
