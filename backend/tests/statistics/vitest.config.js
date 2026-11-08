import {defineConfig} from 'vitest/config';
export default defineConfig({envDir:false,test:{include:['tests/statistics/**/*.test.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:15000}});
