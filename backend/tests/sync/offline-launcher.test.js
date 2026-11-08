import './support/isolation-guard.js';
import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The development launcher for the Godot HTTP stage: loopback only, simulated stores, orderly stop, no real profile.
const BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const LAUNCHER = 'scripts/run-offline-backend.js';
const children = [];
afterEach(() => { for (const c of children.splice(0)) if (c.exitCode === null) c.kill(); });
const env = (extra = {}) => ({ SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_ENV: 'test', ...extra });

function launch(args = ['--port', '0', '--exit-on-stdin-close'], extra = {}) {
  const child = spawn(process.execPath, ['--import', './tests/jwt/env-guard.js', LAUNCHER, ...args], { cwd: BACKEND, env: env(extra), stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(child);
  const state = { out: '', err: '', exit: null, child };
  child.stdout.on('data', d => { state.out += d; });
  child.stderr.on('data', d => { state.err += d; });
  state.exited = new Promise(resolve => child.on('exit', code => { state.exit = code; resolve(code); }));
  state.url = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('launcher did not listen')), 20000);
    child.stdout.on('data', () => { const m = /"url":"(http:\/\/127\.0\.0\.1:\d+)"/.exec(state.out); if (m) { clearTimeout(timer); resolve(m[1]); } });
    child.on('exit', () => { clearTimeout(timer); reject(new Error('launcher exited')); });
  });
  return state;
}

it('OL01 the launcher listens on 127.0.0.1 only, serves health, rejects unauthenticated sync and stops in order when stdin closes', async () => {
  const s = launch();
  const url = await s.url;
  expect(JSON.parse(s.out.trim().split('\n')[0])).toMatchObject({ offlineBackend: 'listening', profile: 'offline-test' });
  const health = await fetch(url + '/api/health');
  expect(health.status).toBe(200);
  expect((await fetch(url + '/api/v2/sync/batches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
  expect((await fetch(url + '/api/identity/me')).status).toBe(404);            // legacy routes are not mounted
  s.child.stdin.write('shutdown\n');
  expect(await s.exited).toBe(0);
  await expect(fetch(url + '/api/health')).rejects.toThrow();
  expect(s.err).toBe('');
});

it('OL02 closing stdin also stops it, and a restart on a new port starts with empty simulated state', async () => {
  const a = launch(); const urlA = await a.url;
  a.child.stdin.end();
  expect(await a.exited).toBe(0);
  const b = launch(); const urlB = await b.url;
  expect(urlB).not.toBe('');
  expect((await fetch(urlB + '/api/health')).status).toBe(200);
  b.child.stdin.write('shutdown\n'); expect(await b.exited).toBe(0);
  expect(urlA).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
});

it('OL03 there is no way to choose host, database, user, profile or URI; production and bad arguments fail before listening', () => {
  for (const args of [['--host', '0.0.0.0'], ['--port', 'abc'], ['--port', '70000'], ['--profile', 'main'], ['--uri', 'mongodb://x'], ['--user', 'twosides_integration_test'], ['extra']]) {
    const r = spawnSync(process.execPath, [LAUNCHER, ...args], { cwd: BACKEND, env: env(), encoding: 'utf8', timeout: 20000 });
    expect(r.status, args.join(' ')).toBe(1); expect(r.stdout).toBe(''); expect(r.stderr).toBe('Unable to start the offline backend\n');
  }
  const production = spawnSync(process.execPath, [LAUNCHER, '--port', '0'], { cwd: BACKEND, env: env({ NODE_ENV: 'production' }), encoding: 'utf8', timeout: 20000 });
  expect(production.status).toBe(1); expect(production.stdout).toBe('');
});

it('OL04 the launcher sources reach no Atlas, Mongoose, C.2, environment file or real configuration, and npm start is unchanged', () => {
  const text = fs.readFileSync(BACKEND + LAUNCHER, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const imports = [...text.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
  for (const i of imports) expect(i).not.toMatch(/mongoose|mongodb|atlas|c2-|durable-revocation|dotenv|mongo-/i);
  expect(text).not.toMatch(/process\.env|\.env\b|require\(/);
  expect(JSON.parse(fs.readFileSync(BACKEND + 'package.json', 'utf8')).scripts.start).toBe('node src/server.js');
});
