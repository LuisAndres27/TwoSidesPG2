import {defineConfig} from 'vitest/config';
// Offline B84 suite: driver double + frontend modules. No Docker, no MongoDB, no network beyond loopback.
export default defineConfig({envDir:false,test:{include:['tests/b84/**/*.test.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:60000,hookTimeout:30000}});
