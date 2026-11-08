// Neutral module (B86.7): the PUBLIC, synthetic HMAC key of the demonstration/synthetic databases and its key check. Depends on node:crypto only.
// It lives apart from demo-store.js because demo-store.js loads the B80 test-isolation guard (and tests/), which must never be reachable from an Atlas action.
// Public, synthetic key for the demonstration databases only. It protects nothing real: it just keys the hashes of synthetic identifiers.
import {createHash,createHmac} from 'node:crypto';
export const B84_KEY=createHash('sha256').update('PUBLIC B84 SYNTHETIC DEMO KEY').digest();
export const B84_KEY_CHECK=createHmac('sha256',B84_KEY).update('key-check').digest('hex');
