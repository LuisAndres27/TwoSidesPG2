import {defineConfig} from 'vitest/config';
// Opt-in real MongoDB suite for B84 (needs the owner's container twosides-b811-mongo and B84_REAL_TESTS=1).
export default defineConfig({envDir:false,test:{include:['tests/b84/b84-real.integration.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:240000,hookTimeout:60000}});
