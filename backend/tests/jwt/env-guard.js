import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Loaded before the test runner and in its workers. Fail before any .env content access.
const check = value => {
  const name = value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value;
  if (typeof name === 'string' && /^\.env(?:\.|$)/i.test(path.basename(name)))
    throw new Error('Environment file access blocked in isolated tests');
};
for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream']) {
  const original = fs[name];
  fs[name] = function (file, ...args) { check(file); return original.call(this, file, ...args); };
}
for (const name of ['readFile', 'open']) {
  const original = fs.promises[name];
  fs.promises[name] = function (file, ...args) { check(file); return original.call(this, file, ...args); };
}
syncBuiltinESMExports();
