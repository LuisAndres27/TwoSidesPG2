// Runs the whole backend vitest suite in the two configurations it needs, so a missing/odd temporary root is never mistaken for a product defect:
//   1. everything except the two files that REQUIRE an explicit disposable root, with C2_FINAL_TEST_ROOT unset (the PowerShell/ACL based C.2
//      receiver tests then use their own default root under %LOCALAPPDATA%; pointing the variable at an arbitrary folder makes their ACL gate refuse it);
//   2. those two files (c2-activatable AC03, c2-final-release FR05/FR06) with C2_FINAL_TEST_ROOT set to a fresh folder under backend/.work, removed afterwards.
// It reads no .env, connects nowhere and never touches C2Runtime. Usage (from backend/):  node scripts/run-backend-regression.js
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('..', import.meta.url));
const vitest = path.join(backend, 'node_modules', 'vitest', 'vitest.mjs');
const rootDependent = ['tests/sync/c2-activatable.test.js', 'tests/sync/c2-final-release.test.js'];
const baseEnv = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA,
  USERPROFILE: process.env.USERPROFILE, NODE_ENV: 'test' };
const run = (args, env) => spawnSync(process.execPath, ['--import', './tests/jwt/env-guard.js', vitest, 'run', '--config', 'vitest.config.js', ...args], { cwd: backend, env, stdio: 'inherit' });

const first = run(rootDependent.flatMap(f => ['--exclude', f]), baseEnv);
const work = path.join(backend, '.work'), root = path.join(work, 'regression-root-' + randomUUID().replaceAll('-', ''));
fs.mkdirSync(root, { recursive: true });
let second;
try { second = run(rootDependent, { ...baseEnv, C2_FINAL_TEST_ROOT: root }); }
finally { if (path.dirname(root) === work && path.basename(root).startsWith('regression-root-')) fs.rmSync(root, { recursive: true, force: true }); }
process.exit(first.status === 0 && second.status === 0 ? 0 : 1);
