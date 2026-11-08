import {defineConfig} from 'vitest/config';
// Independent opt-in selection. Does not include the owner-container restart test.
export default defineConfig({envDir:false,test:{include:['tests/statistics/b82-*.real.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:180000,hookTimeout:60000}});
