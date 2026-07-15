// @ts-check
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'graphify-out'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        DOMException: 'readonly',
        Worker: 'readonly',
        MessageEvent: 'readonly',
        self: 'readonly',
        localStorage: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        RequestInit: 'readonly',
        setTimeout: 'readonly',
        structuredClone: 'readonly',
        Storage: 'readonly',
        clearTimeout: 'readonly',
        crypto: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['*.config.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', module: 'readonly' },
    },
  },
  {
    // Domain purity boundary (DEMO-005 / CLAUDE.md "Architecture rules"): the domain layer
    // never imports React, MSW or IndexedDB.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'src/domain must stay pure: no React imports.' },
            { name: 'react-dom', message: 'src/domain must stay pure: no React imports.' },
            { name: 'msw', message: 'src/domain must stay pure: no MSW imports.' },
            { name: 'msw/browser', message: 'src/domain must stay pure: no MSW imports.' },
            { name: 'msw/node', message: 'src/domain must stay pure: no MSW imports.' },
            { name: 'idb', message: 'src/domain must stay pure: no IndexedDB imports.' },
          ],
          patterns: [
            { group: ['react/*', 'react-dom/*'], message: 'src/domain must stay pure: no React imports.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'indexedDB', message: 'src/domain must stay pure: no IndexedDB access.' },
        { name: 'window', message: 'src/domain must stay pure: no browser globals.' },
        { name: 'document', message: 'src/domain must stay pure: no browser globals.' },
      ],
    },
  },
];
