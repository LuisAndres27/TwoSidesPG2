import {defineConfig} from 'vitest/config';
// Never included by the ordinary statistics configuration. No downloads or existing services.
// B81.1: the second file is extra TTL/idempotency evidence for the owner-prepared container; it skips itself in any other mode.
export default defineConfig({envDir:false,test:{include:['tests/statistics/b81-mongo.real.js','tests/statistics/b81-ttl.real.js'],setupFiles:['./tests/jwt/env-guard.js','./tests/statistics/b80-isolation-guard.js'],environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:180000,hookTimeout:60000}});
