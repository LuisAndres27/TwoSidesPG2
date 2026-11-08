import { createHash } from 'node:crypto';
import { invalid } from './errors.js';

export const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

// Retain duplicate-key and numeric lexical evidence before JSON.parse can discard it.
export function parseStrict(text, { canonicalNumbers = false, maxDepth = 8 } = {}) {
  if (typeof text !== 'string' || text.startsWith('\uFEFF')) throw invalid('invalid_json');
  let i = 0;
  const ws = () => { while (/[ \t\r\n]/.test(text[i] ?? '\0')) i++; };
  function string() {
    const start = i++;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') { try { return JSON.parse(text.slice(start, i)); } catch { throw invalid('invalid_json'); } }
      if (c === '\\') i++;
    }
    throw invalid('invalid_json');
  }
  function value(depth) {
    ws(); if (depth > maxDepth) throw invalid('invalid_json');
    if (text[i] === '"') return string();
    if (text[i] === '{') {
      i++; ws(); const result = Object.create(null), keys = new Set();
      if (text[i] === '}') { i++; return result; }
      while (true) {
        ws(); if (text[i] !== '"') throw invalid('invalid_json'); const k = string();
        if (keys.has(k)) throw invalid('duplicate_json_key'); keys.add(k);
        ws(); if (text[i++] !== ':') throw invalid('invalid_json'); result[k] = value(depth + 1); ws();
        const end = text[i++]; if (end === '}') return result; if (end !== ',') throw invalid('invalid_json');
      }
    }
    if (text[i] === '[') {
      i++; ws(); const result = []; if (text[i] === ']') { i++; return result; }
      while (true) { result.push(value(depth + 1)); ws(); const end = text[i++]; if (end === ']') return result; if (end !== ',') throw invalid('invalid_json'); }
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, i)) { i += token.length; return result; }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!match) throw invalid('invalid_json'); i += match[0].length;
    const n = Number(match[0]);
    if (!Number.isFinite(n) || (canonicalNumbers && (!/^(0|[1-9]\d*)$/.test(match[0]) || !Number.isSafeInteger(n)))) throw invalid('invalid_number');
    return n;
  }
  const result = value(0); ws(); if (i !== text.length) throw invalid('invalid_json'); return result;
}

export function readCanonical(text, expectedHash) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 16128) throw invalid('invalid_operation');
  const value = parseStrict(text, { canonicalNumbers: true });
  // Current v1 whitelist contains only ASCII strings. No normalization/rehash of input.
  if (/[^\x20-\x7e]/.test(text) || canonical(value) !== text || digest(text) !== expectedHash) throw invalid('invalid_canonical_envelope');
  return value;
}
