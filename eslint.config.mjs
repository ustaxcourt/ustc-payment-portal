import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Equivalent to tslint trailing-comma: true
      'comma-dangle': ['error', 'always-multiline'],
      // Equivalent to tslint no-console: false
      'no-console': 'off',
    },
  },
  {
    // Allow 'any' in test files for mocking purposes
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.js', '*.mjs', 'terraform/'],
  }
);
