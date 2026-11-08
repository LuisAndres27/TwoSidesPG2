import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { canonical, digest } from '../modules/sync/canonical-envelope.js';
import { collectionTotals, countSyntheticDocuments, deleteSyntheticDocuments } from './profile.js';

// B05.5 stage 8 - the bounded synthetic scenario of the first real Express -> Atlas run. It only runs when the launcher is given --synthetic-run, inside
// the launcher process (the only place that holds the connection), against the HTTP server that process just started on 127.0.0.1.
//
// Scope: ONE synthetic account, ONE batch of at most 10 operations (a prefix of the C# contract vectors re-addressed to a fresh random binding), one
// resend, one receipt query, a persistence check, then cleanup of exactly the documents of that account. No load, no concurrency, no restart.
// The result never contains the credential, a token, a hash or an operation payload. A failure stops further WRITES; cleanup still runs, but only for
// the account id this run created. An authorization window that closes stops new writes and is never extended.
export const SYNTHETIC_BATCH_SIZE = 10;
const VECTORS = new URL('../../tests/sync/support/csharp-vectors.json', import.meta.url);

export function syntheticOperations(count = SYNTHETIC_BATCH_SIZE) {
  if (!Number.isInteger(count) || count < 1 || count > SYNTHETIC_BATCH_SIZE) throw new Error('synthetic_batch_size');
  const vectors = JSON.parse(fs.readFileSync(VECTORS, 'utf8'));
  const binding = { installationId: randomUUID(), localPlayerId: randomUUID(), bindingGeneration: 1 };
  const chosen = vectors.operations.slice(0, count);
  const ids = new Set(chosen.map(op => op.operationId));
  if (chosen.some(op => op.dependencies.some(d => !ids.has(d.operationId ?? d)))) throw new Error('synthetic_prefix_not_closed');
  const operations = chosen.map(op => {
    const envelope = JSON.parse(op.canonicalEnvelope.split(vectors.localPlayerId).join(binding.localPlayerId).split(vectors.installationId).join(binding.installationId));
    const text = canonical(envelope);
    return { ...structuredClone(op), canonicalEnvelope: text, payloadHash: digest(text) };
  });
  return { binding, operations };
}

export async function runSyntheticScenario({ url, bundle, executionId, notAfter, now = Date.now, manifestFile, fetchImpl = fetch, operationCount = SYNTHETIC_BATCH_SIZE }) {
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(url)) throw new Error('synthetic_url_rejected');
  const result = { executionId, startedAt: new Date(now()).toISOString(), steps: [], checks: {}, errors: [], documents: {}, cleanup: {}, success: false };
  const manifest = { executionId, startedAt: result.startedAt, accountIds: [], registrationIds: [], operationIds: [], note: 'No secrets: ids only.' };
  const save = () => { if (manifestFile) fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), { flag: 'w' }); };
  const windowOpen = () => now() < Date.parse(notAfter);
  const call = async (route, { method = 'GET', body, token } = {}) => {
    const began = performance.now();
    const response = await fetchImpl(url + route, { method, headers: { ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, json, ms: Math.round(performance.now() - began) };
  };
  const step = (name, ms, extra = {}) => result.steps.push({ name, ms, ...extra });
  const must = (name, condition, detail) => { result.checks[name] = !!condition; if (!condition) throw Object.assign(new Error(name), { detail }); };
  let accountId = null, baseline = null, writesAllowed = true;
  try {
    // A. connectivity of the HTTP side (TLS, SCRAM user and privileges were verified by the opener before listening).
    const health = await call('/api/health'); step('health', health.ms, { status: health.status }); must('http_health_200', health.status === 200, health.status);
    must('permissions_verified', bundle.permissions?.status === 'verified-read-only' && bundle.permissions.role === 'readWrite', bundle.permissions);
    baseline = await collectionTotals(bundle); result.documents.before = baseline;

    // C. one synthetic account.
    if (!windowOpen()) throw Object.assign(new Error('authorization_window_closed'), { detail: 'before registration' });
    const { binding, operations } = syntheticOperations(operationCount);
    const credential = randomBytes(32).toString('base64url'), registrationId = randomUUID();
    manifest.registrationIds.push(registrationId); manifest.operationIds = operations.map(o => o.operationId); save();
    const registration = await call('/api/v2/technical/registrations', { method: 'POST', body: { schemaVersion: 2, registrationId, credential, ...binding } });
    step('register', registration.ms, { status: registration.status }); accountId = registration.json?.technicalAccountId ?? null;
    if (accountId) { manifest.accountIds.push(accountId); save(); }
    must('register_201_or_200', [200, 201].includes(registration.status) && /^[0-9a-f-]{36}$/.test(accountId ?? ''), registration.status);
    const login = await call('/api/v2/technical/sessions', { method: 'POST', body: { schemaVersion: 2, technicalAccountId: accountId, credential, installationId: binding.installationId, localPlayerId: binding.localPlayerId } });
    step('login', login.ms, { status: login.status }); must('login_200', login.status === 200 && typeof login.json?.accessToken === 'string', login.status);
    const token = login.json.accessToken, header = decodeProtectedHeader(token), claims = decodeJwt(token);
    result.jwt = { alg: header.alg, typ: header.typ, kid: header.kid, ver: claims.ver, lifetimeSeconds: claims.exp - claims.iat, subjectMatchesAccount: claims.sub === accountId, issuer: claims.iss, audience: claims.aud };
    must('jwt_v2_rs256', header.alg === 'RS256' && header.typ === 'at+jwt' && claims.ver === 2 && claims.sub === accountId && claims.exp - claims.iat === 900, result.jwt);
    const me = await call('/api/v2/technical/me', { token }); step('me', me.ms, { status: me.status });
    must('me_identifies_account', me.status === 200 && me.json?.technicalAccountId === accountId, me.status);

    // D. ingestion: one batch, receipts, resend.
    if (!windowOpen()) throw Object.assign(new Error('authorization_window_closed'), { detail: 'before ingestion' });
    const send = () => call('/api/v2/sync/batches', { method: 'POST', token, body: { schemaVersion: 2, batchId: randomUUID(), operations } });
    const first = await send(); step('batch', first.ms, { status: first.status, committed: first.json?.counters?.committed });
    must('batch_all_committed', first.status === 200 && first.json?.counters?.committed === operations.length && first.json.results.every(r => r.receipt), { status: first.status, counters: first.json?.counters });
    const attempts = operations.map(o => ({ operationId: o.operationId, payloadHash: o.payloadHash, leaseId: randomUUID(), attempt: 1 }));
    const receipts = await call('/api/v2/sync/receipts/query', { method: 'POST', token, body: { schemaVersion: 2, attempts } });
    step('receipts', receipts.ms, { status: receipts.status });
    must('receipts_found', receipts.status === 200 && receipts.json.results.length === operations.length && receipts.json.results.every(r => r.status === 'found'), receipts.status);
    must('receipts_equal_batch', receipts.json.results.every((r, i) => JSON.stringify(r.receipt) === JSON.stringify(first.json.results[i].receipt)), 'receipt mismatch');
    const resend = await send(); step('resend', resend.ms, { status: resend.status, duplicates: resend.json?.results?.filter(r => r.status === 'duplicate').length });
    must('resend_all_duplicate', resend.status === 200 && resend.json.results.length === operations.length && resend.json.results.every(r => r.status === 'duplicate') && resend.json.counters.committed === 0, resend.json?.counters);

    // E. persistence in Atlas, isolated to this account.
    const counts = await countSyntheticDocuments(bundle, [accountId]); result.documents.created = counts;
    const totals = await collectionTotals(bundle); result.documents.after = totals;
    const delta = Object.fromEntries(Object.keys(totals).map(k => [k, totals[k] - baseline[k]]));
    result.documents.delta = delta;
    const own = name => counts[name];
    must('operations_persisted', own('integration_v2_operations') === operations.length, counts);
    must('identity_session_guard_persisted', own('integration_v2_identities') === 1 && own('integration_v2_ownerGuards') === 1 && own('integration_v2_identitySessions') >= 1, counts);
    must('no_duplicates_after_resend', own('integration_v2_operations') === operations.length, counts);
    must('only_this_account_created_documents', Object.keys(totals).every(k => delta[k] === counts[k]), { delta, counts });
  } catch (error) {
    writesAllowed = false;
    result.errors.push({ check: error.message, detail: error.detail ?? null });
  }

  // Cleanup: only the account id created above; nothing if registration never produced one.
  if (accountId) {
    try {
      result.cleanup.deleted = await deleteSyntheticDocuments(bundle, [accountId]);
      result.cleanup.remaining = await countSyntheticDocuments(bundle, [accountId]);
      const totals = await collectionTotals(bundle); result.documents.afterCleanup = totals;
      result.cleanup.complete = Object.values(result.cleanup.remaining).every(n => n === 0);
      result.cleanup.totalsRestored = baseline ? Object.keys(totals).every(k => totals[k] === baseline[k]) : null;
    } catch (error) { result.cleanup.error = typeof error?.code === 'string' ? error.code : 'cleanup_failed'; result.cleanup.complete = false; }
  } else result.cleanup.complete = true;
  result.finishedAt = new Date(now()).toISOString();
  result.success = result.errors.length === 0 && result.cleanup.complete === true && result.cleanup.totalsRestored !== false && writesAllowed;
  manifest.result = { success: result.success, cleanupComplete: result.cleanup.complete }; save();
  return Object.freeze(result);
}
