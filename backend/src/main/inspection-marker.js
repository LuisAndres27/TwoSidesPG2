import fs from 'node:fs';

// The single-use marker of one inspection: a small local JSON file beside the authorization file, named <executionId>.inspection.json. It holds ids, timestamps
// and a result code, never a password, token, URI or driver message. Its existence marks the authorization as consumed.
export const claimExecution = (file, info) => fs.writeFileSync(file, JSON.stringify({ ...info, note: 'No secrets.' }), { flag: 'wx' });   // throws if it already exists
export const isClaimed = file => fs.existsSync(file);
export function recordResult(file, info) {
  try { fs.writeFileSync(file, JSON.stringify({ ...info, note: 'No secrets.' })); } catch { /* the claim already exists; the result is informational */ }
}
