import {defineConfig} from 'vitest/config';
// Offline B86 suite: configuration policy, connector rules, privilege matrix, synthetic dataset. No Docker, no MongoDB, no network.
export default defineConfig({envDir:false,test:{include:['tests/b86/**/*.test.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:60000,hookTimeout:30000}});
