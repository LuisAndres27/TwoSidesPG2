import './support/isolation-guard.js';
import { afterAll, afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import express from 'express';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../src/app.js';

// B22, offline: the HTTPS design for Godot -> Express main. Certificates are generated at run time in temporary directories with a throw-away test CA (never trusted by the machine,
// never reused); every server listens on 127.0.0.1 with an ephemeral port. Nothing external is contacted, Atlas is not touched, Godot is not run and no real URL or secret appears.
// Node's TLS stack models the *policy* (chain, host name, validity, protocol) that the game's .NET HttpClient applies through the Windows trust store; it does not replace a live test.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url)), projectRoot = path.resolve(backendRoot, '..');
const OPENSSL = ['C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'openssl'].find(c => spawnSync(c, ['version'], { encoding: 'utf8' }).status === 0);
const needsOpenssl = OPENSSL ? it : it.skip;
const temps = [], servers = [];
afterEach(async () => { for (const s of servers.splice(0)) await new Promise(r => { s.closeAllConnections?.(); s.close(() => r()); }); });
afterAll(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); });
const read = (...p) => fs.readFileSync(path.join(projectRoot, ...p), 'utf8');
const strip = text => text.split(/\r?\n/).filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('#')).join('\n');
const walk = (dir, exts) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => ['node_modules', '.git', '.godot', '.work', 'bin', 'obj'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(dir, e.name), exts) : exts.some(x => e.name.endsWith(x)) ? [path.join(dir, e.name)] : []);

function pki() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-b22-')); temps.push(dir);
  const run = (...args) => { const r = spawnSync(OPENSSL, args, { cwd: dir, encoding: 'utf8' }); if (r.status !== 0) throw new Error('openssl failed: ' + r.stderr.slice(0, 200)); };
  const conf = (name, extra = '') => { fs.writeFileSync(path.join(dir, name + '.cnf'), `[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=${name}\n${extra}`); };
  conf('ca', '[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n');
  run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '2', '-config', 'ca.cnf', '-extensions', 'v3_ca');
  const leaf = (name, san, extraArgs = []) => {
    conf(name); fs.writeFileSync(path.join(dir, name + '.ext'), `subjectAltName=${san}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n`);
    run('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', name + '.key', '-out', name + '.csr', '-config', name + '.cnf');
    run('x509', '-req', '-in', name + '.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', name + '.crt', '-extfile', name + '.ext', ...(extraArgs.length ? extraArgs : ['-days', '2']));
    return { key: fs.readFileSync(path.join(dir, name + '.key')), cert: fs.readFileSync(path.join(dir, name + '.crt')) };
  };
  conf('selfsigned');
  run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'selfsigned.key', '-out', 'selfsigned.crt', '-days', '2', '-config', 'selfsigned.cnf', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1');
  return { ca: fs.readFileSync(path.join(dir, 'ca.crt')), good: leaf('good', 'DNS:localhost,IP:127.0.0.1'), otherHost: leaf('otherhost', 'DNS:other.invalid'),
    expired: leaf('expired', 'DNS:localhost,IP:127.0.0.1', ['-not_before', '20200101000000Z', '-not_after', '20200102000000Z']),
    selfSigned: { key: fs.readFileSync(path.join(dir, 'selfsigned.key')), cert: fs.readFileSync(path.join(dir, 'selfsigned.crt')) } };
}
const listenTls = (credentials, handler, extra = {}) => new Promise(resolve => { const s = https.createServer({ ...credentials, ...extra }, handler).listen(0, '127.0.0.1', () => { servers.push(s); resolve(s.address().port); }); });
const get = (port, options = {}, p = '/api/health') => new Promise(resolve => {
  const request = https.get({ host: '127.0.0.1', port, path: p, servername: 'localhost', timeout: 5000, ...options }, response => {
    let body = ''; response.on('data', c => { body += c; }); response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
  });
  request.on('error', error => resolve({ error: error.code ?? error.message })); request.on('timeout', () => request.destroy(new Error('timeout')));
});

needsOpenssl('HT01 the real Express app answers over TLS only to a client that validates the chain, host name and dates (modelling what the game requires)', async () => {
  const p = pki(), app = createApp({ legacyIdentity: false }), port = await listenTls(p.good, app);
  const ok = await get(port, { ca: [p.ca] }); expect(ok.status).toBe(200); expect(JSON.parse(ok.body)).toEqual({ status: 'ok', service: 'two-sides-backend' });
  expect(ok.headers).toMatchObject({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  expect((await get(port, { ca: [p.ca], servername: 'other.invalid' })).error).toBe('ERR_TLS_CERT_ALTNAME_INVALID');                     // wrong host name
  expect((await get(port, {})).error).toMatch(/UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN/);                              // CA not in the trust store: rejected, not accepted
  const unknownCa = pki(); expect((await get(port, { ca: [unknownCa.ca] })).error).toMatch(/UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN/);   // a different (attacker) CA does not validate this chain
}, 120000);

needsOpenssl('HT02 certificate failures are refused: untrusted self-signed, certificate for another name, expired, and protocol mismatches; ignoring errors is possible only by an explicit insecure option', async () => {
  const p = pki(), handler = (_q, s) => s.end('{"status":"ok"}');
  const selfPort = await listenTls(p.selfSigned, handler), otherPort = await listenTls(p.otherHost, handler), expiredPort = await listenTls(p.expired, handler);
  expect((await get(selfPort, { ca: [p.ca] })).error).toMatch(/DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY/);
  expect((await get(otherPort, { ca: [p.ca] })).error).toBe('ERR_TLS_CERT_ALTNAME_INVALID');
  expect((await get(expiredPort, { ca: [p.ca] })).error).toBe('CERT_HAS_EXPIRED');
  const tls12 = await listenTls(p.good, handler, { minVersion: 'TLSv1.2' });
  expect((await get(tls12, { ca: [p.ca], maxVersion: 'TLSv1.1' })).error).toBeTruthy();                                                   // no protocol downgrade below TLS 1.2
  expect((await get(tls12, { ca: [p.ca], minVersion: 'TLSv1.2' })).status).toBe(200);
  const plain = await new Promise(r => { const s = http.createServer(handler).listen(0, '127.0.0.1', () => { servers.push(s); r(s.address().port); }); });
  expect((await get(plain, { ca: [p.ca] })).error).toBeTruthy();                                                                          // https:// against a plain-HTTP port fails (no silent fallback)
  const httpToTls = await new Promise(resolve => { const q = http.get({ host: '127.0.0.1', port: tls12, path: '/', timeout: 3000 }, r => resolve({ status: r.statusCode })); q.on('error', e => resolve({ error: e.code })); q.on('timeout', () => q.destroy()); });
  expect(httpToTls.status === 200).toBe(false);                                                                                             // http:// against the TLS port never yields the API
  expect((await get(selfPort, { rejectUnauthorized: false })).status).toBe(200);                                                           // what an "ignore certificate errors" switch would allow: the game must never have one (HT05)
}, 120000);

it('HT03 an unreachable or closed server ends fast with a transport error, never a hang (the game maps it to a retryable failure and keeps playing)', async () => {
  const net = await import('node:net'); const free = await new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const started = Date.now(), result = await get(free, {}); expect(result.error).toBe('ECONNREFUSED'); expect(Date.now() - started).toBeLessThan(3000);
  const silent = await new Promise(r => { const sockets = new Set(), s = net.createServer(c => { sockets.add(c); c.on('close', () => sockets.delete(c)); }).listen(0, '127.0.0.1', () => { s.closeAllConnections = () => sockets.forEach(c => c.destroy()); servers.push(s); r(s.address().port); }); });   // accepts and never answers
  const t0 = Date.now(), hung = await get(silent, { timeout: 400 }); expect(hung.error).toBe('timeout'); expect(Date.now() - t0).toBeLessThan(3000);
}, 30000);

it('HT04 behind a TLS proxy on loopback: Express ignores X-Forwarded-For today (trust proxy off); a loopback-only trust setting would honour it ONLY from the proxy hop', async () => {
  const live = createApp({ legacyIdentity: false }); expect(live.get('trust proxy')).toBe(false);
  expect(live.get('trust proxy fn')('127.0.0.1', 0)).toBe(false);                                                                             // no hop is trusted
  const probe = (setting) => { const a = express(); a.set('trust proxy', setting); a.get('/ip', (q, r) => r.json({ ip: q.ip })); return a; };
  const askIp = async (app, forwarded) => new Promise(resolve => { const s = http.createServer(app).listen(0, '127.0.0.1', () => { servers.push(s); http.get({ host: '127.0.0.1', port: s.address().port, path: '/ip', headers: forwarded ? { 'x-forwarded-for': forwarded } : {} }, r => { let b = ''; r.on('data', c => { b += c; }); r.on('end', () => resolve(JSON.parse(b).ip)); }); }); });
  expect(await askIp(probe(false), '203.0.113.9')).toMatch(/127\.0\.0\.1$/);                                                                  // today: forged header ignored, every client = the proxy address
  expect(await askIp(probe('loopback'), '203.0.113.9')).toBe('203.0.113.9');                                                                 // loopback hop trusted: header honoured (the proxy must OVERWRITE it)
  expect(await askIp(probe('loopback'), '198.51.100.1, 203.0.113.9')).toBe('203.0.113.9');                                                   // chain: the right-most untrusted address wins, left forgeries are skipped
  expect(await askIp(probe(1), '203.0.113.9')).toBe('203.0.113.9');
  expect(await askIp(probe('loopback'))).toMatch(/127\.0\.0\.1$/);                                                                           // no header: the socket address
  const lifecycle = read('backend', 'src/composition/lifecycle.js'), config = read('backend', 'src/config/server.js');
  expect(config).toMatch(/HOST = '127\.0\.0\.1'/); expect(lifecycle).toMatch(/LOOPBACK = Object\.freeze\(\['127\.0\.0\.1', '::1', 'localhost'\]\)/);   // Express stays loopback-only
  expect(strip(read('backend', 'src/app.js'))).toMatch(/app\.set\('trust proxy', false\)/);
});

it('HT05 the game side: HTTPS-only main configuration, system certificate validation (no override anywhere), no proxy, no redirects, bounded timeouts, no database secret', () => {
  const dirs = [path.join(projectRoot, 'scripts'), path.join(projectRoot, 'integration'), path.join(projectRoot, 'local-persistence/sync-http'), path.join(projectRoot, 'local-persistence/src')];
  const sources = dirs.filter(d => fs.existsSync(d)).flatMap(d => walk(d, ['.cs', '.cs.txt'])).filter(f => !/[\\/](sync-http-tests|game-save-tests|infrastructure-tests|tests)[\\/]/.test(f));
  expect(sources.length).toBeGreaterThan(20);
  const code = Object.fromEntries(sources.map(f => [path.relative(projectRoot, f), strip(fs.readFileSync(f, 'utf8'))]));
  const forbidden = /ServerCertificateCustomValidationCallback|DangerousAcceptAnyServerCertificateValidator|RemoteCertificateValidationCallback|ServerCertificateValidationCallback|CheckCertificateRevocationList\s*=\s*false|SslProtocols|ClientCertificate|ServicePointManager|TlsOptions\.ClientUnsafe|ClientUnsafe|SetTlsOptions\(.*Unsafe|AllowInvalidCertificates|TrustAll/i;
  expect(Object.entries(code).filter(([, t]) => forbidden.test(t)).map(([f]) => f)).toEqual([]);                                             // nothing disables or replaces certificate validation
  expect(Object.entries(code).filter(([, t]) => /mongodb(\+srv)?:\/\/|MONGODB_URI|twosides_backend|fxqeo8o|two_sides_db|SCRAM|authSource/i.test(t)).map(([f]) => f)).toEqual([]);   // the database password/URI never reaches the game
  // B57 deliberately pins ONE synthetic test endpoint; no public endpoint may become hard-coded.
  const pinned=Object.entries(code).filter(([,t])=>/https:\/\/[A-Za-z0-9]/.test(t));
  expect(pinned.map(([f])=>f.replaceAll('\\','/'))).toEqual(['local-persistence/sync-http/SyncWorkerLifecycle.cs.txt']);
  expect(pinned[0][1].match(/https:\/\/[^"'\s]+/g)).toEqual(['https://localhost:8443/']);
  expect(pinned[0][1]).toContain('related[0]!=HttpsFlag||storage.Count!=1||storage[0]!=SyncTestStorageMode.Flag');
  const transport = code['local-persistence\\sync-http\\SyncHttpTransport.cs.txt'] ?? code['local-persistence/sync-http/SyncHttpTransport.cs.txt'];
  expect(transport).toBeTruthy();
  for (const needle of ['AllowAutoRedirect=false', 'UseProxy=false', 'UseCookies=false', 'ConnectTimeout=TimeSpan.FromSeconds(3)', 'Scheme==Uri.UriSchemeHttps', 'allowLoopbackHttp && baseUri.Scheme==Uri.UriSchemeHttp && baseUri.IsLoopback',
    'string.IsNullOrEmpty(baseUri.UserInfo)', 'string.IsNullOrEmpty(baseUri.Query)', 'baseUri.AbsolutePath=="/"', 'timeout>=TimeSpan.FromMilliseconds(100) && timeout<=TimeSpan.FromSeconds(60)', 'maxResponseBytes is >=1024 and <=4*1024*1024', 'TimeSpan.FromSeconds(15)']) expect(transport.replace(/\s+/g, ' '), needle).toContain(needle.replace(/\s+/g, ' '));
  const lifecycle = Object.entries(code).find(([f]) => /SyncWorkerLifecycle/.test(f))[1];
  expect(lifecycle).toMatch(/uri\.Scheme!=Uri\.UriSchemeHttps\)return null/); expect(lifecycle).toMatch(/new SyncHttpOptions\(uri\)/);   // main mode: HTTPS or disabled; the loopback-HTTP switch is the separate explicit test flag
  expect(read('project.godot')).not.toMatch(/main_api_url/);                                                                               // no URL committed: sync stays disabled until configured per machine
});

it('HT06 local play never depends on the network: the sync worker is off without configuration, and the existing C# checks (not run here) cover offline, unreachable and silent servers', () => {
  const host = read('integration/sqlite/GameSyncHost.cs'); expect(host).toMatch(/if\(options is null\)SetProcess\(false\)/); expect(host).toMatch(/Task\.Run/); expect(host).toMatch(/catch\(Exception\)\{\/\*[^*]*never reaches the frame loop/);
  const checks = read('local-persistence/sync-http-tests/SyncHttpChecks.cs.txt');
  for (const title of ['main sync configuration enables only an HTTPS API and never a database URI', 'HTTP interruption keeps every pending operation unchanged; an unreachable server and a silent server both end as retryable']) expect(checks).toContain(title);
  const dispatcher = read('local-persistence/sync-http/SyncOutboxDispatcher.cs.txt'); expect(dispatcher).toMatch(/network problem can only\s*\/\/ move an operation to retryable_failure/);
  expect(read('.gitignore')).toMatch(/^override\.cfg$/m);                                                                                    // a per-machine API URL never reaches Git
});

it('HT07 transport boundaries remain intact while authorized B60 startup edits require a new integrity baseline', () => {
  const manifestPath = path.join(process.env.LOCALAPPDATA ?? '', 'TwoSidesMainIntegrity', 'backend-integrity-manifest.json');
  if (!fs.existsSync(manifestPath)) return;                                                                                                  // other machines have no baseline
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); expect(manifest.formatVersion).toBe(2);
  const sha = f => createHash('sha256').update(fs.readFileSync(path.join(backendRoot, f))).digest('hex');
  for (const f of ['src/app.js', 'src/composition/lifecycle.js', 'src/config/server.js']) expect(sha(f), f).toBe(manifest.files[f].sha256);
  for (const f of ['src/main/runtime.js', 'scripts/run-main-backend.ps1']) expect(sha(f), f).not.toBe(manifest.files[f].sha256);
});
