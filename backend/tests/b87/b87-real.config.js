import {defineConfig} from 'vitest/config';
// Opt-in suite on a DISPOSABLE local Metabase + MongoDB (tests/b87/stack.js). Requires B87_REAL_TESTS=1. Never Atlas, never AWS, never B85.
export default defineConfig({envDir:false,test:{include:['tests/b87/b87-metabase.real.js','tests/b87/b87-caddy.real.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:600000,hookTimeout:900000}});
