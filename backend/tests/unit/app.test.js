import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get, Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import app from '../../src/app.js';
import { HOST, readPort } from '../../src/config/server.js';

let server;
let port;

before(async () => {
  server = app.listen(0, HOST);
  await once(server, 'listening');
  port = server.address().port;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

function request(path) {
  return new Promise((resolve, reject) => {
    const req = get({ hostname: HOST, port, path, agent: false }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('Local request timed out')));
    req.on('error', reject);
  });
}

test('GET /api/health responde 200 con el contrato completo', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /^application\/json/);
  assert.deepEqual(JSON.parse(response.body), { status: 'ok', service: 'two-sides-backend' });
  assert.equal(response.headers['x-powered-by'], undefined);
});

test('una ruta inexistente responde 404 sin detalles internos', async () => {
  const response = await request('/missing');
  assert.equal(response.status, 404);
  assert.deepEqual(JSON.parse(response.body), { error: 'not_found' });
});

test('no hay rutas de identidad ni estadisticas en B01', async () => {
  for (const path of ['/api/auth', '/api/identity', '/api/statistics', '/api/sync']) {
    assert.equal((await request(path)).status, 404);
  }
});

test('importar app no abre puertos ni lee archivos .env', () => {
  const appUrl = new URL('../../src/app.js', import.meta.url).href;
  const script = `
    import { Server } from 'node:net';
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    Server.prototype.listen = () => { throw new Error('Unexpected listener'); };
    const guard = original => function(path, ...args) {
      if (/(^|[\\\\/])\\.env(?:$|[.])/.test(String(path))) throw new Error('Unexpected env read');
      return original.call(this, path, ...args);
    };
    fs.readFileSync = guard(fs.readFileSync);
    fs.readFile = guard(fs.readFile);
    fs.promises.readFile = guard(fs.promises.readFile);
    syncBuiltinESMExports();
    const { default: app } = await import(${JSON.stringify(appUrl)});
    if (typeof app !== 'function') throw new Error('Invalid app export');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 5000, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('servidor de pruebas limitado a loopback', () => {
  assert.ok(server instanceof Server);
  assert.equal(server.address().address, '127.0.0.1');
});

test('puerto predeterminado seguro y puerto efimero admitido', () => {
  assert.equal(readPort('3000'), 3000);
  assert.equal(readPort('0'), 0);
  assert.equal(readPort('65535'), 65535);
});

test('configuracion invalida no expone el valor recibido', () => {
  for (const value of ['', '-1', '65536', '3.5', 'invalid-value', '3000suffix']) {
    assert.throws(() => readPort(value), { message: 'Invalid PORT configuration' });
  }
});

test('arranque con puerto invalido falla sin detalles internos', () => {
  const result = spawnSync(process.execPath, ['src/server.js'], {
    cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 5000,
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, PORT: 'invalid-value' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^Unable to start two-sides-backend: invalid configuration\r?\n$/);
});
