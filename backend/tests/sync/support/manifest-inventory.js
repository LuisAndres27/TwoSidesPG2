import { VITEST_TEMPORARY_PATHS, MANIFEST_KIND, digestOfFiles } from '../../../scripts/backend-integrity.js';

// Test support (B37): what LP06 checks about the CURRENT integrity manifest, without a hard-coded file count.
//   manifest  the parsed manifest JSON (already on disk, written by `backend-integrity.js manifest`)
//   actual    computeManifest() of the real tree (hashes of what is on disk now)
// Returns a list of problem codes ([] = acceptable). It never accepts a manifest because it declares itself valid:
//   - the manifest must be self-consistent (kind, algorithm, exclusions limited to the two fixed Vitest cache paths, digest recomputed from its own entries, fileCount = entries);
//   - its inventory must equal the REAL tree: same file count and no file added or removed without authorization;
//   - everything outside src/ (scripts/, node_modules/, package files, vitest.config.js) must be byte-identical to the manifest. Content changes under src/ are the authorized
//     work in progress between two baselines; they are caught by `backend-integrity.js verify` / the pre-start preflight, which is what invalidates the baseline.
const inSrc = name => name.startsWith('src/');
export function inventoryProblems(manifest, actual) {
  const problems = [];
  if (!manifest || manifest.kind !== MANIFEST_KIND || manifest.algorithm !== 'sha256' || typeof manifest.files !== 'object' || manifest.files === null) return ['manifest_invalid'];
  const declared = manifest.excluded ?? [];
  if (!Array.isArray(declared) || declared.some(e => !VITEST_TEMPORARY_PATHS.includes(e))) problems.push('exclusions_not_allowed');
  const names = Object.keys(manifest.files);
  if (names.some(n => declared.some(e => n === e || n.startsWith(e + '/')))) problems.push('excluded_path_listed');
  if (digestOfFiles(manifest.files) !== manifest.treeDigest) problems.push('digest_not_derived_from_entries');
  if (manifest.fileCount !== names.length) problems.push('file_count_not_entry_count');
  if (manifest.fileCount !== actual.fileCount) problems.push('file_count_differs_from_tree');
  if (actual.problems.length) problems.push('links_or_special_files');
  if (names.some(n => !(n in actual.files))) problems.push('file_removed');
  if (Object.keys(actual.files).some(n => !(n in manifest.files))) problems.push('file_added');
  if (names.some(n => n in actual.files && !inSrc(n) && actual.files[n].sha256 !== manifest.files[n].sha256)) problems.push('file_modified_outside_src');
  return problems;
}
