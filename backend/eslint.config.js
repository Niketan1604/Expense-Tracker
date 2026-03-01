// @ts-check
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',  // allow _event, _unused etc
        varsIgnorePattern: '^_'
      }],

      // General rules
      'no-console': 'error',      // use logger instead of console
      'no-unused-vars': 'off',    // handled by @typescript-eslint/no-unused-vars
    },
  },

  {
    ignores: ['dist/**', 'node_modules/**', '.aws-sam/**'],
  },
];