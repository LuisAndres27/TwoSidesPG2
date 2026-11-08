// Pre-start guard of Express main. Run by run-main-backend.ps1 BEFORE the password prompt and before any connection. Offline and read-only: it opens no socket, reads no environment
// variable and no .env, and prints only fixed check names and reason codes (never paths, hashes of files, key material or driver text).
//   node scripts\main-preflight.js --manifest <abs> --anchor <sha256 hex> --key-file <abs> --key-id <id> --expected-key-id <id> --key-fingerprint <sha256 hex>
// Checks, in order: (1) key id equals the pinned id, (2) the key loads with the same loader as main and its public fingerprint equals the recorded one,
// (3) the manifest is self-consistent AND its tree digest equals the ANCHOR recorded outside the tree, (4) the current code tree equals the manifest.
// An arbitrary manifest is therefore never trusted by itself: it must carry the digest the operator wrote down elsewhere.
import { pathToFileURL } from 'node:url';
import { assertKeyId, inspectMainSigningKey } from '../src/main/signing-key.js';
import { verifyManifestFile } from './backend-integrity.js';

const HEX64 = /^[0-9a-f]{64}$/;
export async function runPreflight({ manifest, anchor, keyFile, keyId, expectedKeyId, keyFingerprint }, root) {
  const checks = [], fail = (check, reason) => ({ ok: false, checks: [...checks, { check, ok: false }], reason });
  const pass = check => checks.push({ check, ok: true });
  try { assertKeyId(keyId); assertKeyId(expectedKeyId); } catch { return fail('key_id', 'key_id_invalid'); }
  if (keyId !== expectedKeyId) return fail('key_id', 'key_id_mismatch'); pass('key_id');
  if (!HEX64.test(anchor ?? '') || !HEX64.test(keyFingerprint ?? '')) return fail('anchors', 'anchors_required'); pass('anchors');
  let key; try { key = await inspectMainSigningKey(keyFile, keyId); } catch { return fail('key', 'key_rejected'); }
  if (key.bits < 3072) return fail('key', 'key_too_small'); pass('key');
  if (key.fingerprint !== keyFingerprint) return fail('key_fingerprint', 'key_fingerprint_mismatch'); pass('key_fingerprint');
  let result; try { result = verifyManifestFile(manifest, root, { anchor }); } catch { return fail('manifest', 'manifest_location_rejected'); }
  if (!result.ok) return { ok: false, checks: [...checks, { check: 'manifest', ok: false }], reason: 'integrity_' + result.reason, counts: result.counts };
  pass('manifest'); return { ok: true, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = { '--manifest': 'manifest', '--anchor': 'anchor', '--key-file': 'keyFile', '--key-id': 'keyId', '--expected-key-id': 'expectedKeyId', '--key-fingerprint': 'keyFingerprint' };
  const options = {}, argv = process.argv.slice(2);
  let usage = argv.length !== 12;
  for (let i = 0; !usage && i < argv.length; i += 2) { const name = names[argv[i]]; if (!name || name in options) usage = true; else options[name] = argv[i + 1]; }
  const result = usage ? { ok: false, checks: [], reason: 'usage' } : await runPreflight(options);
  const line = JSON.stringify({ mainPreflight: result.ok ? 'ok' : 'failed', reason: result.reason, checks: result.checks, counts: result.counts });
  (result.ok ? console.log : console.error)(line);
  process.exit(result.ok ? 0 : 1);
}
