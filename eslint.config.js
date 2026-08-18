import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Generated or produced artifacts are never linted. `src/api/schema.d.ts` is
    // emitted by `openapi-typescript` and is the contract's shape verbatim -
    // hand-edits would be reverted by the drift check, so linting it is noise.
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'blob-report',
      'src/api/schema.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: [
      '*.config.{ts,js}',
      'e2e/**/*.ts',
      'scripts/**/*.{ts,js}',
      'deploy/**/*.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  // Disable stylistic rules that could conflict with Prettier (Prettier owns
  // formatting; ESLint owns correctness). Must come last to win.
  prettier,
);
