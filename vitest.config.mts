import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'src/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts',
    ],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/**/__tests__/**'],
      // A ratchet: raise these as coverage grows, never lower them
      thresholds: {
        statements: 40,
        branches: 31,
        functions: 35,
        lines: 40,
      },
    },
  },
  oxc: {
    target: 'es2022',
  },
});
