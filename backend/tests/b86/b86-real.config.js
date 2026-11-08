import {defineConfig} from 'vitest/config';
// Opt-in suite on a DISPOSABLE authenticated TLS replica set (new container twosides-b86-rbac). Requires B86_REAL_TESTS=1. Never Atlas.
export default defineConfig({envDir:false,test:{include:['tests/b86/b86-rbac.real.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:300000,hookTimeout:300000}});
