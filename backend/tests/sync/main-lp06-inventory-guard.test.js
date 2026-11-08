import './support/isolation-guard.js';
import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeManifest } from '../../scripts/backend-integrity.js';
import { inventoryProblems } from './support/manifest-inventory.js';

// B37: LP06 no longer hard-codes a file count; these tests prove the replacement check still detects every discrepancy it must detect (mutated copies, nothing on disk changes).
const root = fileURLToPath(new URL('../../', import.meta.url));
const manifestPath = path.join(process.env.LOCALAPPDATA ?? '', 'TwoSidesMainIntegrity', 'backend-integrity-manifest.json');
const live = fs.existsSync(manifestPath) ? it : it.skip;
let cache;
const load = () => cache ??= { manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')), actual: computeManifest(root) };
const copy = v => structuredClone(v);

live('G1 the installed v4 baseline rejects the authorized but not yet resealed B60 tree', () => { const { manifest, actual } = load(); const p=inventoryProblems(manifest, actual); expect(p).toContain('file_modified_outside_src'); expect(p).toContain('file_added'); }, 30000);

live('G2 a corrupt manifest (entry changed without recomputing the digest) is rejected', () => {
  const { manifest, actual } = load(), m = copy(manifest), k = Object.keys(m.files).find(n => n.startsWith('node_modules/'));
  m.files[k].sha256 = '0'.repeat(64);
  expect(inventoryProblems(m, actual)).toContain('digest_not_derived_from_entries');
});

live('G3 a manifest that only declares itself valid (fileCount and digest edited to agree with a forged list) still fails against the real tree', async () => {
  const { manifest, actual } = load(), m = copy(manifest), { digestOfFiles } = await import('../../scripts/backend-integrity.js');
  m.files['node_modules/forged/index.js'] = { sha256: 'a'.repeat(64), size: 1 }; m.fileCount = Object.keys(m.files).length; m.treeDigest = digestOfFiles(m.files);
  const p = inventoryProblems(m, actual);
  expect(p).toContain('file_count_differs_from_tree'); expect(p).toContain('file_removed'); expect(p).not.toContain('digest_not_derived_from_entries');
});

live('G4 a stale fileCount (declared count different from the entries and from the tree) is rejected', () => {
  const { manifest, actual } = load(), m = copy(manifest); m.fileCount = 3168;
  const p = inventoryProblems(m, actual); expect(p).toContain('file_count_not_entry_count'); expect(p).toContain('file_count_differs_from_tree');
});

live('G5 a file added to the tree (not in the manifest) is detected', () => {
  const { manifest, actual } = load(), a = copy(actual); a.files['src/unauthorized.js'] = { sha256: 'b'.repeat(64), size: 1 }; a.fileCount++;
  const p = inventoryProblems(manifest, a); expect(p).toContain('file_added'); expect(p).toContain('file_count_differs_from_tree');
});

live('G6 a file removed from the tree is detected', () => {
  const { manifest, actual } = load(), a = copy(actual), k = Object.keys(a.files).find(n => n.startsWith('scripts/')); delete a.files[k]; a.fileCount--;
  const p = inventoryProblems(manifest, a); expect(p).toContain('file_removed'); expect(p).toContain('file_count_differs_from_tree');
});

live('G7 an unexpected modification outside src/ (scripts, dependencies, package files) is detected; a src/ edit is tolerated here and caught by verify/preflight', () => {
  const { actual } = load(), manifest=copy(actual); // In-memory valid baseline isolates each tamper case from the intentionally stale installed v4.
  for (const prefix of ['scripts/', 'node_modules/', 'package.json', 'package-lock.json', 'vitest.config.js']) {
    const a = copy(actual), k = Object.keys(a.files).find(n => n.startsWith(prefix)); a.files[k].sha256 = 'c'.repeat(64);
    expect(inventoryProblems(manifest, a), prefix).toContain('file_modified_outside_src');
  }
  const a = copy(actual), k = Object.keys(a.files).find(n => n.startsWith('src/')); a.files[k].sha256 = 'c'.repeat(64);
  expect(inventoryProblems(manifest, a)).toEqual([]);
});

live('G8 exclusions beyond the two Vitest cache paths, a listed excluded path, links or special files, and a foreign kind/algorithm are rejected', () => {
  const { manifest, actual } = load();
  let m = copy(manifest); m.excluded = [...(m.excluded ?? []), 'node_modules/express']; expect(inventoryProblems(m, actual)).toContain('exclusions_not_allowed');
  m = copy(manifest); m.files['node_modules/.vite/x.json'] = { sha256: 'd'.repeat(64), size: 1 }; expect(inventoryProblems(m, actual)).toContain('excluded_path_listed');
  const a = copy(actual); a.problems = ['src/link (link)']; expect(inventoryProblems(manifest, a)).toContain('links_or_special_files');
  m = copy(manifest); m.kind = 'other'; expect(inventoryProblems(m, actual)).toEqual(['manifest_invalid']);
  m = copy(manifest); m.algorithm = 'md5'; expect(inventoryProblems(m, actual)).toEqual(['manifest_invalid']);
  expect(inventoryProblems(null, actual)).toEqual(['manifest_invalid']);
});
