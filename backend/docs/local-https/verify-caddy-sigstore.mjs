// Manual keyless (Sigstore) verification of Caddy release assets, without running any downloaded code. Prints booleans and public facts only.
import fs from 'node:fs';
import crypto from 'node:crypto';

const dl = process.env.LOCALAPPDATA + '/TwoSidesLocalProxy/download';
const IDENTITY = 'URI:https://github.com/caddyserver/caddy/.github/workflows/release.yml@refs/tags/v2.11.7';
const targets = [
  { blob: 'caddy_2.11.7_windows_amd64.zip', sig: 'caddy_2.11.7_windows_amd64.zip.sig', cert: 'caddy_2.11.7_windows_amd64.pem' },
  { blob: 'caddy_2.11.7_checksums.txt', sig: 'caddy_2.11.7_checksums.txt.sig', cert: 'caddy_2.11.7_checksums.txt.pem' },
];
const getJson = async (url, init) => { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(url + ' -> ' + r.status); return r; };
const certPem = name => { const raw = fs.readFileSync(`${dl}/${name}`, 'utf8').trim(); return raw.startsWith('-----') ? raw : Buffer.from(raw, 'base64').toString('utf8'); };

// Independent trust anchors, from Sigstore's own infrastructure (not from GitHub or Caddy)
const bundle = await (await getJson('https://fulcio.sigstore.dev/api/v2/trustBundle')).json();
const chain = bundle.chains[0].certificates.map(pem => new crypto.X509Certificate(pem));
const root = chain.find(c => c.subject === c.issuer), intermediates = chain.filter(c => c !== root);
const rekorKey = crypto.createPublicKey(await (await getJson('https://rekor.sigstore.dev/api/v1/log/publicKey')).text());
console.log(JSON.stringify({ fulcioChainCerts: chain.length, rootSubject: root?.subject.replace(/\n/g, ','), intermediates: intermediates.map(c => c.subject.replace(/\n/g, ',')) }));

for (const t of targets) {
  const out = { asset: t.blob };
  const blob = fs.readFileSync(`${dl}/${t.blob}`), sig = Buffer.from(fs.readFileSync(`${dl}/${t.sig}`, 'utf8').trim(), 'base64');
  const leaf = new crypto.X509Certificate(certPem(t.cert));
  out.signatureValid = crypto.verify('sha256', blob, leaf.publicKey, sig);                                        // ECDSA over the file, key from the certificate
  out.identityPinned = leaf.subjectAltName === IDENTITY;
  const issuer = intermediates.find(c => leaf.checkIssued(c) && leaf.verify(c.publicKey));
  out.leafSignedByFulcioIntermediate = !!issuer;
  out.intermediateSignedByRoot = !!issuer && issuer.verify(root.publicKey) && issuer.checkIssued(root);
  out.rootSelfSigned = root.verify(root.publicKey);
  const from = new Date(leaf.validFrom), to = new Date(leaf.validTo);
  out.certWindow = [from.toISOString(), to.toISOString()];
  const d = x => new Date(x); out.chainWindows = { intermediate: [d(issuer.validFrom).toISOString(), d(issuer.validTo).toISOString()], root: [d(root.validFrom).toISOString(), d(root.validTo).toISOString()] };
  out.chainValidAtSigning = !!issuer && d(issuer.validFrom) <= from && to <= d(issuer.validTo) && d(root.validFrom) <= d(issuer.validFrom) && d(issuer.validTo) <= d(root.validTo);
  // Rekor transparency log: an entry for this exact file hash, same signature and certificate, integrated while the certificate was valid
  const hash = crypto.createHash('sha256').update(blob).digest('hex');
  const ids = await (await getJson('https://rekor.sigstore.dev/api/v1/index/retrieve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash: 'sha256:' + hash }) })).json();
  out.rekorEntries = ids.length; out.rekorMatch = false;
  for (const id of ids) {
    const entry = Object.values(await (await getJson('https://rekor.sigstore.dev/api/v1/log/entries/' + id)).json())[0];
    const body = JSON.parse(Buffer.from(entry.body, 'base64').toString('utf8')), spec = body.spec;
    const sameSig = spec.signature?.content && Buffer.from(spec.signature.content, 'base64').equals(sig);
    const entryCert = spec.signature?.publicKey?.content && new crypto.X509Certificate(Buffer.from(spec.signature.publicKey.content, 'base64').toString('utf8'));
    const sameCert = !!entryCert && entryCert.raw.equals(leaf.raw), sameHash = spec.data?.hash?.value === hash;
    const canonical = `{"body":"${entry.body}","integratedTime":${entry.integratedTime},"logID":"${entry.logID}","logIndex":${entry.logIndex}}`;
    const setValid = crypto.verify('sha256', Buffer.from(canonical), rekorKey, Buffer.from(entry.verification.signedEntryTimestamp, 'base64'));
    const t0 = new Date(entry.integratedTime * 1000);
    if (sameSig && sameCert && sameHash) { out.rekorMatch = true; out.rekorSignedEntryTimestampValid = setValid; out.rekorIntegratedAt = t0.toISOString(); out.integratedWhileCertValid = t0 >= from && t0 <= to; out.rekorLogIndex = entry.logIndex; out.hasInclusionProof = !!entry.verification.inclusionProof; }
  }
  console.log(JSON.stringify(out));
}
