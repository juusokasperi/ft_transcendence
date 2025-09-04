// Flat config for monorepo: backend (node) + frontend (react/vite)

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import eslintConfigPrettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // Ignore patterns
  { ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.vite/**', '**/coverage/**'] },

  // Base JS recommendations
  js.configs.recommended,

  // TypeScript across the repo (auto-detect tsconfig in subfolders)
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    languageOptions: {
      ...c.languageOptions,
      parserOptions: {
        ...c.languageOptions?.parserOptions,
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
      globals: { ...globals.es2024 },
    },
  })),

  // Import hygiene (works for TS with TS resolver)
  {
    plugins: { import: importPlugin },
    rules: {
      'import/order': ['warn', { 'newlines-between': 'always' }],
      'import/newline-after-import': 'warn',
      // TS handles unresolved/import types
      'import/no-unresolved': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },

  // Frontend (React)
  {
    files: ['client/**/*.{ts,tsx,js,jsx}','frontend/**/*.{ts,tsx,js,jsx}'],
    plugins: { react, 'react-hooks': hooks, 'jsx-a11y': jsxA11y },
    languageOptions: { globals: { ...globals.browser } },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...hooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
    },
  },

  // Backend (Node/Fastify)
  {
    files: ['backend/**/*.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
    },
  },

  // Turn off formatting-related rules to let Prettier own formatting
  eslintConfigPrettier,
];
