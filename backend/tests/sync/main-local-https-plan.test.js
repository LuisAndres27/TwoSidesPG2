import './support/isolation-guard.js';
import { afterAll, afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../src/app.js';
import { computeManifest } from '../../scripts/backend-integrity.js';
import { inventoryProblems } from './support/manifest-inventory.js';

// B23, offline: lint of the planned local-HTTPS artefacts (backend/docs/local-https/*.template) and proof that the scoped local test CA does what the plan claims.
// Nothing is installed, no Windows store is touched, no Caddy exists here; certificates are generated in temporary directories and thrown away.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url)), templates = path.join(backendRoot, 'docs', 'local-https');
const OPENSSL = ['C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'openssl'].find(c => spawnSync(c, ['version'], { encoding: 'utf8' }).status === 0);
const needsOpenssl = OPENSSL ? it : it.skip;
const win = process.platform === 'win32' ? it : it.skip;
const temps = [], servers = [];
afterEach(async () => { for (const s of servers.splice(0)) await new Promise(r => { s.closeAllConnections?.(); s.close(() => r()); }); });
afterAll(() => { for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true }); });
const template = name => fs.readFileSync(path.join(templates, name), 'utf8');
const code = text => text.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).join('\n');
const temp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-b23-')); temps.push(d); return d; };

it('LP01 the Caddyfile template listens only on 127.0.0.1:8443, forwards only /api/* to 127.0.0.1:3000, opens no admin/redirect/ACME port, installs no trust and trusts no proxy header', () => {
  const text = code(template('Caddyfile.template'));
  for (const needle of ['admin off', 'auto_https off', 'skip_install_trust', 'persist_config off', 'default_bind 127.0.0.1', 'bind 127.0.0.1', 'https://:8443 {', 'protocols tls1.2 tls1.3','reverse_proxy 127.0.0.1:3000', '@notapi not path /api/*', '@wronghost not host localhost', 'max_size 2MB', 'level ERROR', 'protocols h1 h2'])
    expect(text, needle).toContain(needle);
  expect(text).toMatch(/tls @@TLS_DIR@@\/localhost\.crt @@TLS_DIR@@\/localhost\.key/);                                       // a fixed, explicit certificate: no internal CA, no ACME
  for (const bad of [/tls\s+internal/, /trusted_proxies/, /client_ip_headers/, /insecure_skip_verify|skip_verify/, /0\.0\.0\.0/, /\[::\]/, /\bhttp:\/\//, /:80\b/, /:443\b/, /acme|email|on_demand/i, /\blog\s+\{[^}]*output\s+(file|stdout)/s, /debug/i, /header_up\s+-?Authorization/i, /file_server|php_fastcgi|import\s/])
    expect(text, String(bad)).not.toMatch(bad);
  expect((text.match(/reverse_proxy/g) ?? []).length).toBe(1); expect((text.match(/https?:\/\/[^\s{]+/g) ?? []).sort()).toEqual(['https://:8443']);
  expect(text).not.toMatch(/\blog\b[^\n]*\n\s*(format|output)/);                                                           // no access log is configured: request headers (Authorization) are never written
});

needsOpenssl('LP02 the scoped local test CA can vouch ONLY for localhost: a leaf for another name or address is rejected by the same CA, validity is short, and the real Express app answers over it', async () => {
  const dir = temp(), run = (...args) => { const r = spawnSync(OPENSSL, args, { cwd: dir, encoding: 'utf8' }); return r; }, must = (...args) => { const r = run(...args); if (r.status !== 0) throw new Error(args[0] + ': ' + r.stderr.slice(0, 300)); return r; };
  for (const f of ['ca.cnf', 'leaf.cnf', 'leaf.ext']) fs.writeFileSync(path.join(dir, f), template(f + '.template'));
  must('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '30', '-config', 'ca.cnf');
  must('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'localhost.key', '-out', 'localhost.csr', '-config', 'leaf.cnf');
  must('x509', '-req', '-in', 'localhost.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'localhost.crt', '-days', '14', '-extfile', 'leaf.ext');
  expect(must('verify', '-CAfile', 'ca.crt', 'localhost.crt').stdout).toContain('OK');
  const text = must('x509', '-in', 'ca.crt', '-noout', '-text').stdout;
  expect(text).toMatch(/CA:TRUE, pathlen:0/); expect(text).toMatch(/X509v3 Name Constraints: critical/); expect(text).toMatch(/Permitted:[\s\S]*DNS:localhost[\s\S]*IP:127\.0\.0\.1\/255\.255\.255\.255/); expect(text).toMatch(/Certificate Sign\b/);
  const dates = which => { const out = must('x509', '-in', which, '-noout', '-dates').stdout, get = k => Date.parse(out.match(new RegExp(k + '=(.*)'))[1].trim()); return (get('notAfter') - get('notBefore')) / 86400000; };
  expect(Math.round(dates('ca.crt'))).toBe(30); expect(Math.round(dates('localhost.crt'))).toBe(14);
  expect(must('x509', '-in', 'localhost.crt', '-noout', '-ext', 'subjectAltName,extendedKeyUsage,basicConstraints').stdout).toMatch(/DNS:localhost[\s\S]*TLS Web Server Authentication[\s\S]*CA:FALSE/);
  // the CA cannot be abused for other names (this is what makes installing it in the user store low-risk)
  for (const [name, san] of [['evil', 'DNS:evil.invalid'], ['subdomain-of-other', 'DNS:example.com'], ['other-ip', 'IP:10.0.0.1'], ['mixed', 'DNS:localhost,DNS:evil.invalid']]) {
    fs.writeFileSync(path.join(dir, name + '.cnf'), '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=' + name + '\n'); fs.writeFileSync(path.join(dir, name + '.ext'), `subjectAltName = ${san}\nextendedKeyUsage = serverAuth\nbasicConstraints = critical,CA:FALSE\n`);
    must('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', name + '.key', '-out', name + '.csr', '-config', name + '.cnf'); must('x509', '-req', '-in', name + '.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', name + '.crt', '-days', '14', '-extfile', name + '.ext');
    const verdict = run('verify', '-CAfile', 'ca.crt', name + '.crt'); expect(verdict.status, name).not.toBe(0); expect(verdict.stdout + verdict.stderr, name).toMatch(/permitted subtree violation/i);
  }
  fs.writeFileSync(path.join(dir, 'subca.cnf'), '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=sub\n'); fs.writeFileSync(path.join(dir, 'subca.ext'), 'basicConstraints = critical,CA:TRUE\nkeyUsage = critical,keyCertSign\n');
  must('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'subca.key', '-out', 'subca.csr', '-config', 'subca.cnf'); must('x509', '-req', '-in', 'subca.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'subca.crt', '-days', '14', '-extfile', 'subca.ext');
  fs.writeFileSync(path.join(dir, 'viasub.cnf'), '[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=viasub\n'); fs.writeFileSync(path.join(dir, 'viasub.ext'), 'subjectAltName = DNS:localhost\n');
  must('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'viasub.key', '-out', 'viasub.csr', '-config', 'viasub.cnf'); must('x509', '-req', '-in', 'viasub.csr', '-CA', 'subca.crt', '-CAkey', 'subca.key', '-CAcreateserial', '-out', 'viasub.crt', '-days', '7', '-extfile', 'viasub.ext');
  expect(run('verify', '-CAfile', 'ca.crt', '-untrusted', 'subca.crt', 'viasub.crt').status).not.toBe(0);                  // pathlen:0 — it cannot delegate to a sub-CA
  // end-to-end: the real Express app over TLS with this chain, validated by name
  const server = https.createServer({ key: fs.readFileSync(path.join(dir, 'localhost.key')), cert: fs.readFileSync(path.join(dir, 'localhost.crt')) }, createApp({ legacyIdentity: false }));
  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => { servers.push(server); r(server.address().port); }));
  const ask = (servername, extra = {}) => new Promise(resolve => { const q = https.get({ host: '127.0.0.1', port, path: '/api/health', servername, ca: fs.readFileSync(path.join(dir, 'ca.crt')), timeout: 5000, ...extra }, res => { let b = ''; res.on('data', c => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }); q.on('error', e => resolve({ error: e.code })); });
  expect(await ask('localhost')).toMatchObject({ status: 200 }); expect(await ask(undefined)).toMatchObject({ status: 200 });   // by name and by 127.0.0.1 (IP SAN)
  expect((await ask('evil.invalid')).error).toBe('ERR_TLS_CERT_ALTNAME_INVALID');
  expect((await ask('localhost', { ca: undefined })).error).toMatch(/UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED/);          // without the CA in the trust store the client refuses
}, 180000);

it('LP03 the Godot override satisfies the game\'s own URL rules (HTTPS, no credentials/query/fragment, path "/") and touches nothing else; project.godot stays untouched', () => {
  const text = code(template('override.cfg.template')), values = [...text.matchAll(/^([A-Za-z0-9_/]+)="([^"]*)"$/gm)];
  expect(values.map(m => m[1])).toEqual(['sync/main_api_url']); expect(text).toMatch(/^\[two_sides\]$/m);
  const url = new URL(values[0][2]); expect(url.protocol).toBe('https:'); expect(url.username + url.password + url.search + url.hash).toBe(''); expect(url.pathname).toBe('/'); expect(url.host).toBe('localhost:8443');
  expect(fs.readFileSync(path.resolve(backendRoot, '..', 'project.godot'), 'utf8')).not.toMatch(/main_api_url/);
  expect(fs.readFileSync(path.resolve(backendRoot, '..', '.gitignore'), 'utf8')).toMatch(/^override\.cfg$/m);
});

it('LP04 the probe template never disables certificate validation, never prints credentials or tokens, never logs verbosely, targets only https://localhost:8443 and writes remotely only behind an explicit switch', () => {
  const text = code(template('probe-main-https.ps1.template'));
  for (const bad of [/SkipCertificateCheck/i, /ServerCertificateValidationCallback/i, /TrustAllCerts/i, /curl[^\n]*\s-k\b/, /--insecure/, /Start-Transcript/i, /\s-Verbose\b/i, /--trace|\s-v\b/, /Write-Host/i, /ConvertTo-SecureString/i, /\.env\b/, /mongodb/i, /twosides_backend/i])
    expect(text, String(bad)).not.toMatch(bad);
  expect((text.match(/https?:\/\/[^\s'"]+/g) ?? [])).toEqual(['https://localhost:8443']);
  expect(text).toMatch(/param\(\[switch\]\$WriteSynthetic\)/); expect(text.indexOf("if ($WriteSynthetic)")).toBeGreaterThan(text.indexOf("'4) outside /api"));
  expect(text).toMatch(/Remove-Variable credential, bytes, token/);
  // anything printed with a token/credential variable would be a leak: only status codes, header fields and synthetic ids are echoed
  const printed = text.split('\n').filter(l => /^\s*'/.test(l));
  expect(printed.filter(l => /\$credential|\$bytes/.test(l))).toEqual([]);                                                  // the credential is never echoed
  expect(printed.filter(l => /\$token\b/.test(l) && !/Get-Status/.test(l))).toEqual([]);                                    // the token only appears as an argument of a call that prints a status code
});

win('LP05 the probe template is valid PowerShell 5.1 (parse only; it is not executed)', () => {
  const dir = temp(), file = path.join(dir, 'probe.ps1'); fs.writeFileSync(file, template('probe-main-https.ps1.template'));
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${file.replace(/'/g, "''")}',[ref]$null,[ref]$e);$e.Count`], { encoding: 'utf8' });
  expect(r.stdout.trim()).toBe('0');
});

it('LP06 this stage added no covered code: the integrity baseline still matches the files the plan relies on', () => {
  const manifestPath = path.join(process.env.LOCALAPPDATA ?? '', 'TwoSidesMainIntegrity', 'backend-integrity-manifest.json');
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // B37: no hard-coded count. The manifest must be self-consistent and its inventory must equal the REAL tree (see support/manifest-inventory.js).
  expect(inventoryProblems(manifest, computeManifest(backendRoot, { exclude: manifest.excluded ?? [] }))).toEqual([]);
  const names = Object.keys(manifest.files); expect(names.some(n => n.includes('local-https') || n.endsWith('.template'))).toBe(false);   // docs/templates are outside the inventory
}, 30000);   // hashing the real tree takes ~2.5 s

// B24: the template is also parsed by the REAL, verified Caddy binary (adapt only: it parses and prints JSON; it starts no server, opens no port and creates no file). Skipped when the binary is absent or is not
// byte-identical to the verified release asset, so a test never executes an unverified executable.
const CADDY = path.join(process.env.LOCALAPPDATA ?? '', 'TwoSidesLocalProxy', 'bin', 'caddy.exe');
const CADDY_SHA256 = '5f93a9bd555f3aac9d33af2756ba14b3519d8cca4ffd55256bdaeab444c9db2a';   // caddy.exe from caddy_2.11.7_windows_amd64.zip (signature + Rekor verified in B24)
const caddyVerified = process.platform === 'win32' && fs.existsSync(CADDY) && (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(CADDY)).digest('hex') === CADDY_SHA256;
(caddyVerified ? it : it.skip)('LP07 the verified Caddy 2.11.7 adapts the template to a config that listens only on 127.0.0.1:8443, proxies only to 127.0.0.1:3000 and rejects foreign Hosts inside the route', () => {
  const dir = temp(), file = path.join(dir, 'Caddyfile'); fs.writeFileSync(file, template('Caddyfile.template').replace(/@@TLS_DIR@@/g, 'C:/nonexistent/tls'));
  const run = spawnSync(CADDY, ['adapt', '--config', file, '--pretty'], { cwd: dir, encoding: 'utf8', timeout: 30000, env: { SystemRoot: process.env.SystemRoot, windir: process.env.windir, PATH: path.join(process.env.SystemRoot, 'System32'), XDG_CONFIG_HOME: dir, XDG_DATA_HOME: dir, TEMP: dir, TMP: dir } });
  expect(run.status, run.stderr).toBe(0); expect(run.stderr.trim()).toBe('');
  const config = JSON.parse(run.stdout), servers = Object.values(config.apps.http.servers), flat = JSON.stringify(config);
  expect(servers).toHaveLength(1); const server = servers[0];
  expect(server.listen).toEqual(['127.0.0.1:8443']); expect(server.protocols).toEqual(['h1', 'h2']);                           // no :80, no :443, no HTTP/3 (UDP)
  expect(config.admin).toMatchObject({ disabled: true }); expect(server.automatic_https).toEqual({ disable: true });
  expect(server.tls_connection_policies.at(-1)).toMatchObject({ protocol_min: 'tls1.2', protocol_max: 'tls1.3' });
  expect(server.routes).toHaveLength(4); expect(server.routes.every(r => r.match === undefined || r.match.every(m => !m.host))).toBe(true);   // no site-level Host matcher: the Host decision is an explicit route
  const steps = server.routes, handlers = steps.map(s => s.handle[0].handler);
  expect(handlers).toEqual(['request_body', 'static_response', 'static_response', 'reverse_proxy']);
  expect(steps[0].handle[0].max_size).toBe(2000000);
  expect(steps[1]).toMatchObject({ match: [{ not: [{ host: ['localhost'] }] }], handle: [{ status_code: 421 }] });                // foreign Host -> 421 before anything is proxied
  expect(steps[2]).toMatchObject({ match: [{ not: [{ path: ['/api/*'] }] }], handle: [{ status_code: 404 }] });
  expect(steps[3].handle[0].upstreams).toEqual([{ dial: '127.0.0.1:3000' }]); expect(steps[3].handle[0].transport).toMatchObject({ protocol: 'http', dial_timeout: 3000000000, response_header_timeout: 15000000000 });
  expect(config.apps.tls.certificates.load_files).toEqual([expect.objectContaining({ certificate: 'C:/nonexistent/tls/localhost.crt', key: 'C:/nonexistent/tls/localhost.key' })]);
  for (const forbidden of ['trusted_proxies', 'client_ip_headers', 'acme', 'issuers', 'internal', 'on_demand', 'insecure_skip_verify', '":80"', ':443', '0.0.0.0', '[::]', '"logs":{"default":{"level":"ERROR"}},"logs"', 'access']) expect(flat.includes(forbidden), forbidden).toBe(false);
  expect(config.logging.logs.default.level).toBe('ERROR'); expect(server.logs).toBeUndefined();                               // no access log: Authorization headers are never written
  expect(fs.readdirSync(dir).sort()).toEqual(['Caddyfile']);                                                                    // adapt created nothing
});

// B25: the REAL certificates generated in %LOCALAPPDATA%\TwoSidesLocalProxy\tls (public material only: the private key is never read here). Skipped when they are absent or expired.
const TLS = path.join(process.env.LOCALAPPDATA ?? '', 'TwoSidesLocalProxy', 'tls');
const realCerts = OPENSSL && fs.existsSync(path.join(TLS, 'ca.crt')) && fs.existsSync(path.join(TLS, 'localhost.crt')) && spawnSync(OPENSSL, ['x509', '-in', path.join(TLS, 'localhost.crt'), '-noout', '-checkend', '0'], { encoding: 'utf8' }).status === 0;
(realCerts ? it : it.skip)('LP08 the generated local certificates: scoped CA without private key, 30/14 days, localhost + 127.0.0.1 only, chain valid, foreign names rejected, nothing but three files', () => {
  const o = (...args) => spawnSync(OPENSSL, args, { encoding: 'utf8' });
  expect(fs.readdirSync(TLS).sort()).toEqual(['ca.crt', 'localhost.crt', 'localhost.key']);                                   // no CA key, no CSR, no serial file, no configs
  expect(o('verify', '-CAfile', path.join(TLS, 'ca.crt'), path.join(TLS, 'localhost.crt')).stdout).toContain(': OK');
  const ca = o('x509', '-in', path.join(TLS, 'ca.crt'), '-noout', '-text').stdout, leaf = o('x509', '-in', path.join(TLS, 'localhost.crt'), '-noout', '-text').stdout;
  expect(ca).toMatch(/CA:TRUE, pathlen:0/); expect(ca).toMatch(/Name Constraints: critical[\s\S]*DNS:localhost[\s\S]*IP:127\.0\.0\.1\/255\.255\.255\.255/); expect(ca).toMatch(/Key Usage: critical\s+Certificate Sign\s*\n/);
  expect(leaf).toMatch(/CA:FALSE/); expect(leaf).toMatch(/DNS:localhost, IP Address:127\.0\.0\.1\s*\n/); expect(leaf).toMatch(/TLS Web Server Authentication/); expect(leaf).not.toMatch(/Netscape CA|CA:TRUE/);
  const days = file => { const out = o('x509', '-in', path.join(TLS, file), '-noout', '-dates').stdout, get = k => Date.parse(out.match(new RegExp(k + '=(.*)'))[1].trim()); return (get('notAfter') - get('notBefore')) / 86400000; };
  expect(days('ca.crt')).toBeLessThanOrEqual(30.001); expect(days('localhost.crt')).toBeLessThanOrEqual(14.001);
  const verify = (flag, value) => o('verify', '-CAfile', path.join(TLS, 'ca.crt'), flag, value, path.join(TLS, 'localhost.crt')).status;
  expect([verify('-verify_hostname', 'localhost'), verify('-verify_ip', '127.0.0.1')]).toEqual([0, 0]);
  expect(verify('-verify_hostname', 'evil.invalid')).not.toBe(0); expect(verify('-verify_ip', '10.0.0.1')).not.toBe(0); expect(verify('-verify_hostname', 'localhost.evil.invalid')).not.toBe(0);
  expect(fs.readFileSync(path.join(TLS, 'ca.crt'), 'utf8')).not.toMatch(/PRIVATE KEY/); expect(fs.readFileSync(path.join(TLS, 'localhost.crt'), 'utf8')).not.toMatch(/PRIVATE KEY/);
});
