import fs from 'node:fs';

// B05.5 stage 8 - the single-use marker of a launcher execution: a small local JSON file beside the authorization file, named <executionId>.manifest.json.
// It holds identifiers, timestamps and a result code, never a password, token, URI or driver message. Its existence is what marks an authorization as consumed.
export const claimExecution = (file, info) => fs.writeFileSync(file, JSON.stringify({ ...info, note: 'No secrets.' }), { flag: 'wx' });   // throws if it already exists
export const isClaimed = file => fs.existsSync(file);
export function recordResult(file, info) {
  try { fs.writeFileSync(file, JSON.stringify({ ...info, note: 'No secrets.' })); } catch { /* the claim already exists; the result is informational */ }
}
