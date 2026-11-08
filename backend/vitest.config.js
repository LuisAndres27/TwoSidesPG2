import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: false,
  test: {
    include: ['tests/jwt/**/*.test.js', 'tests/identity-persistence/**/*.test.js', 'tests/sync/**/*.test.js'], environment: 'node', pool: 'forks',
    maxWorkers: 1, fileParallelism: false, testTimeout: 15000, hookTimeout: 15000,
    setupFiles: ['./tests/jwt/env-guard.js'],
  },
});
