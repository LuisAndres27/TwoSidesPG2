// Integrity baseline of the code that Express main executes. It hashes (SHA-256) src/, scripts/, package.json, package-lock.json, vitest.config.js and node_modules/ and compares later runs.
//   node scripts\backend-integrity.js manifest <absolute-manifest-file>   writes a NEW manifest (exclusive create, never overwrites) and prints the tree digest
//   node scripts\backend-integrity.js verify   <absolute-manifest-file>   recomputes and compares; prints counts and at most 20 relative NAMES of differences; exit 0 only when identical
// Exclusions (fixed, see VITEST_TEMPORARY_PATHS): only the Vitest cache directories node_modules/.vite and node_modules/.vitest-cache. Everything else under node_modules is covered.
// Read-only over the project: it never opens backend/.env (it is outside the hashed scope), tests, docs, .git or any secret, never changes an ACL, and prints no file content.
// The manifest is a tripwire, not a proof: a process running as the same user can rewrite both code and manifest (see B15). Record the printed digest outside the machine (or in a signed commit).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertSigningKeyPath } from '../src/main/signing-key.js';

export const MANIFEST_KIND = 'two-sides-backend-integrity';
const DEFAULT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCOPE_DIRECTORIES = ['src', 'scripts', 'node_modules'], SCOPE_FILES = ['package.json', 'package-lock.json', 'vitest.config.js'];
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const posix = relative => relative.split(path.sep).join('/');

// The ONLY exclusions allowed: the two cache directories that Vitest itself writes at the top of node_modules every time tests run (`node_modules/.vite/vitest/<hash>/results.json`,
// and `node_modules/.vitest-cache/<hash>` module-transform cache; vitest/dist references both). Express main never loads them, and no other path (src, scripts, package files, any real
// dependency, a `.vite` folder anywhere else) is excluded. Exclusions are exact relative paths; a manifest may declare fewer of them, never others.
export const VITEST_TEMPORARY_PATHS = Object.freeze(['node_modules/.vite', 'node_modules/.vitest-cache']);
const isExcluded = (relative, exclude) => exclude.some(e => relative === e || relative.startsWith(e + '/'));

export function computeManifest(root = DEFAULT_ROOT, { exclude = VITEST_TEMPORARY_PATHS } = {}) {
  const files = {}, problems = [];
  const visit = (absolute, relative) => {
    if (exclude.includes(relative)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) { problems.push(relative + ' (link)'); return; }
    if (stat.isDirectory()) { for (const name of fs.readdirSync(absolute).sort()) visit(path.join(absolute, name), relative + '/' + name); return; }
    if (!stat.isFile()) { problems.push(relative + ' (special)'); return; }
    files[relative] = { sha256: sha256(fs.readFileSync(absolute)), size: stat.size };
  };
  for (const directory of SCOPE_DIRECTORIES) if (fs.existsSync(path.join(root, directory))) visit(path.join(root, directory), directory);
  for (const file of SCOPE_FILES) if (fs.existsSync(path.join(root, file))) visit(path.join(root, file), file);
  const names = Object.keys(files).sort();
  const treeDigest = sha256(names.map(name => `${name}\0${files[name].sha256}\n`).join(''));
  return { kind: MANIFEST_KIND, formatVersion: 2, algorithm: 'sha256', scope: [...SCOPE_DIRECTORIES, ...SCOPE_FILES], excluded: [...exclude], fileCount: names.length, treeDigest, problems, files: Object.fromEntries(names.map(n => [n, files[n]])) };
}
export function compareManifests(expected, actual) {
  const added = Object.keys(actual.files).filter(n => !(n in expected.files)), removed = Object.keys(expected.files).filter(n => !(n in actual.files));
  const modified = Object.keys(actual.files).filter(n => n in expected.files && actual.files[n].sha256 !== expected.files[n].sha256);
  return { identical: !added.length && !removed.length && !modified.length && !actual.problems.length && expected.treeDigest === actual.treeDigest, added, removed, modified, problems: actual.problems };
}
const brief = list => list.slice(0, 20);

export function createManifestFile(file, root = DEFAULT_ROOT) {
  assertSigningKeyPath(file);                                                       // same location policy as secrets: absolute, outside the project and OneDrive, never an env file
  const manifest = computeManifest(root);
  if (manifest.problems.length) return { ok: false, reason: 'links_or_special_files', problems: brief(manifest.problems) };
  let descriptor;
  try { descriptor = fs.openSync(file, 'wx', 0o600); } catch { return { ok: false, reason: 'file_exists_or_unwritable' }; }
  try { fs.writeSync(descriptor, JSON.stringify({ ...manifest, createdAt: new Date().toISOString() })); } finally { fs.closeSync(descriptor); }
  return { ok: true, fileCount: manifest.fileCount, treeDigest: manifest.treeDigest };
}
// The digest of a files map, recomputed from the entries themselves: a manifest cannot claim a digest that its own list does not produce.
export function digestOfFiles(files) {
  const names = Object.keys(files).sort();
  return sha256(names.map(name => `${name}\0${files[name].sha256}\n`).join(''));
}
// `anchor` is the tree digest the operator recorded OUTSIDE the machine/tree. Without it a manifest only proves self-consistency, not provenance.
export function verifyManifestFile(file, root = DEFAULT_ROOT, { anchor } = {}) {
  assertSigningKeyPath(file);
  if (anchor !== undefined && !/^[0-9a-f]{64}$/.test(anchor)) return { ok: false, reason: 'anchor_invalid' };
  let expected;
  try { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error(); expected = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { ok: false, reason: 'manifest_unreadable' }; }
  if (expected?.kind !== MANIFEST_KIND || expected.algorithm !== 'sha256' || typeof expected.files !== 'object') return { ok: false, reason: 'manifest_invalid' };
  if (digestOfFiles(expected.files) !== expected.treeDigest) return { ok: false, reason: 'manifest_invalid' };
  // A manifest from before B20 declares no exclusions and is verified exactly as it was written. A newer one may declare only the fixed Vitest paths, and must not list files under them.
  const declared = expected.excluded === undefined ? [] : expected.excluded;
  if (!Array.isArray(declared) || declared.some(e => !VITEST_TEMPORARY_PATHS.includes(e)) || Object.keys(expected.files).some(n => isExcluded(n, declared))) return { ok: false, reason: 'manifest_invalid' };
  if (anchor !== undefined && expected.treeDigest !== anchor) return { ok: false, reason: 'anchor_mismatch' };
  const diff = compareManifests(expected, computeManifest(root, { exclude: declared }));
  return { ok: diff.identical, reason: diff.identical ? undefined : 'tree_differs', expectedFiles: expected.fileCount, counts: { added: diff.added.length, removed: diff.removed.length, modified: diff.modified.length, problems: diff.problems.length },
    added: brief(diff.added), removed: brief(diff.removed), modified: brief(diff.modified), problems: brief(diff.problems) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , action, file, ...rest] = process.argv;
  const say = (stream, value) => stream(JSON.stringify(value));
  let result;
  try {
    if (rest.length || !['manifest', 'verify'].includes(action) || typeof file !== 'string') result = { ok: false, reason: 'usage' };
    else result = action === 'manifest' ? createManifestFile(file) : verifyManifestFile(file);
  } catch { result = { ok: false, reason: 'invalid_arguments' }; }
  say(result.ok ? console.log : console.error, { backendIntegrity: result.ok ? 'ok' : 'failed', ...result });
  process.exit(result.ok ? 0 : 1);
}
