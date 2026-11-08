import {defineConfig} from 'vitest/config';
// Offline B87 suite: policy, connection string, titles, layout, provisioning against a FAKE Metabase API, command line, import graph. No Docker, no network.
export default defineConfig({envDir:false,test:{include:['tests/b87/b87-offline.test.js','tests/b87/b87-docs.test.js','tests/b87/b87-express.test.js','tests/b87/b87-autopublish.test.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:60000,hookTimeout:30000}});
