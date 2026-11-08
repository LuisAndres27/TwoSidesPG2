// Offline scanner for material that must never reach Git. It inspects only the files Git would track or stage (`git ls-files --cached --others --exclude-standard`),
// so ignored files such as backend/.env are never listed or opened. Output is `path:line:kind` ONLY; matched text is never printed. Exit 0 = clean, 1 = findings.
//   node scripts\scan-secrets.js [directory]     (default: the project root)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FAKE = /fake|example|placeholder|dummy|changeme|sample|test|<|\*\*\*|xxx/i;
// Readable sentinels used by tests ('wrong-password', 'SENTINEL-NEVER-PRINT-') are words without digits; generated credentials (Atlas, openssl, password managers) include digits.
const SENTINEL = /^[A-Za-z]+(?:[-_ ][A-Za-z]+)*[-_]?$/;
const looksReal = value => !FAKE.test(value) && !SENTINEL.test(value) && value.length > 3;
const MULTILINE_RULES = [['private_key_block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s*[A-Za-z0-9+/]{40,}/]];
const RULES = [
  ['uri_with_password', /mongodb(?:\+srv)?:\/\/[^/@:\s'",]+:([^@\s'",]{3,})@/, match => looksReal(match[1])],
  ['jwt_like_token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/],
  ['password_assignment', /\b(?:password|passwd|secret|api[_-]?key|token)["']?\s*[:=]\s*["']([^"'\s]{10,})["']/i, match => looksReal(match[1])],
];
const NAME_RULES = [['secret_file_name', /(^|\/)\.env(\.|$)(?!example)|\.(pem|key|pfx|p12)$|-authorization[^/]*\.json$|-integrity-manifest[^/]*\.json$/i], ['database_file_name', /\.(sqlite3?|db)(-wal|-shm)?$/i]];
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0');
const MAX_TEXT = 1024 * 1024;

export function scanText(name, text) {
  const findings = [];
  for (const [kind, regex] of MULTILINE_RULES) { const match = regex.exec(text); if (match) findings.push({ file: name, line: text.slice(0, match.index).split('\n').length, kind }); }   // a PEM spans lines
  text.split(/\r?\n/).forEach((line, index) => { for (const [kind, regex, accept] of RULES) { const match = regex.exec(line); if (match && (!accept || accept(match))) findings.push({ file: name, line: index + 1, kind }); } });
  return findings.sort((a, b) => a.line - b.line);
}
export function scanName(name) { return NAME_RULES.filter(([, regex]) => regex.test(name)).map(([kind]) => ({ file: name, line: 0, kind })); }

export function candidateFiles(directory) {
  // The directory must itself be a repository root: a stray repository in a parent (for example the user's home) must not widen or silently change the scan.
  const top = spawnSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status !== 0 || path.resolve(top.stdout.trim()).toLowerCase() !== path.resolve(directory).toLowerCase()) throw new Error('git_unavailable');
  const run = spawnSync('git', ['-C', directory, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error('git_unavailable');
  return run.stdout.split('\0').filter(Boolean);
}
export function scanDirectory(directory) {
  const findings = [];
  for (const relative of candidateFiles(directory)) {
    const name = relative.replace(/\\/g, '/'), absolute = path.join(directory, relative);
    findings.push(...scanName(name));
    let stat; try { stat = fs.lstatSync(absolute); } catch { continue; }
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    let head; try { const fd = fs.openSync(absolute, 'r'); head = Buffer.alloc(Math.min(16, stat.size)); fs.readSync(fd, head, 0, head.length, 0); fs.closeSync(fd); } catch { continue; }
    if (head.length === 16 && head.equals(SQLITE_MAGIC)) { findings.push({ file: name, line: 0, kind: 'sqlite_database_content' }); continue; }
    if (stat.size > MAX_TEXT || head.includes(0)) continue;
    findings.push(...scanText(name, fs.readFileSync(absolute, 'utf8')));
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url)));
  let findings;
  try { findings = scanDirectory(directory); } catch { console.error(JSON.stringify({ secretScan: 'failed', reason: 'git_unavailable' })); process.exit(2); }
  for (const f of findings) console.log(`${f.file}:${f.line}:${f.kind}`);
  console.error(JSON.stringify({ secretScan: findings.length ? 'findings' : 'clean', findings: findings.length }));
  process.exit(findings.length ? 1 : 0);
}
