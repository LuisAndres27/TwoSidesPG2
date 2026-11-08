// B64 bootstrap: built-ins only. Never imports backend code before checking its bytes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const V5=Object.freeze({sha256:'2a4956e951217dff2501d3ffbd35c9024554166e9126ad0134d8fb58c77ad726',treeDigest:'1f3f507348a479d88362767e9e548200003d646ad8930f54cbfc9efc6a9f8c28',fileCount:3172});
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=ok=>{if(!ok)throw new Error('first_read_integrity_rejected');};
export function regularPath(file,{directory=false}={}){
 const absolute=path.resolve(file);let cursor=absolute;
 for(;;){const s=fs.lstatSync(cursor);check(!s.isSymbolicLink());if(cursor===absolute)check(directory?s.isDirectory():s.isFile()&&s.nlink===1);const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;}
 return absolute;
}
export function decodeManifest(bytes,expected=V5){
 check(hash(bytes)===expected.sha256);const m=JSON.parse(bytes.toString('utf8'));
 check(m.kind==='two-sides-backend-integrity'&&m.formatVersion===2&&m.algorithm==='sha256'&&m.treeDigest===expected.treeDigest&&m.fileCount===expected.fileCount&&m.files&&Object.keys(m.files).length===expected.fileCount);
 check(JSON.stringify(m.scope)===JSON.stringify(['src','scripts','node_modules','package.json','package-lock.json','vitest.config.js']));
 const exclusions=['node_modules/.vite','node_modules/.vitest-cache'];check(Array.isArray(m.excluded)&&m.excluded.every(x=>exclusions.includes(x)));
 const names=Object.keys(m.files).sort();
 for(const n of names){const f=m.files[n];check(!n.includes('\\')&&!n.split('/').some(x=>!x||x==='.'||x==='..')&&/^(src\/|scripts\/|node_modules\/|package\.json$|package-lock\.json$|vitest\.config\.js$)/.test(n)&&!exclusions.some(e=>n===e||n.startsWith(e+'/'))&&/^[a-f0-9]{64}$/.test(f.sha256)&&Number.isSafeInteger(f.size)&&f.size>=0);}
 check(hash(names.map(n=>`${n}\0${m.files[n].sha256}\n`).join(''))===m.treeDigest);return m;
}
export async function verifyBackend(manifest,root){
 regularPath(root,{directory:true});regularPath(manifest);
 const m=decodeManifest(fs.readFileSync(manifest));
 // Validate every listed byte before executing even the official verifier.
 for(const [n,f]of Object.entries(m.files)){const p=regularPath(path.join(root,...n.split('/')));const b=fs.readFileSync(p);check(b.length===f.size&&hash(b)===f.sha256);}
 const {verifyManifestFile}=await import(pathToFileURL(path.join(root,'scripts/backend-integrity.js')).href);
 const r=verifyManifestFile(manifest,root,{anchor:V5.treeDigest});check(r.ok&&r.expectedFiles===V5.fileCount);return true;
}
export function validateAuthorization(a,{now=Date.now(),runId,toolHashes}){
 const fields=['kind','runId','issuedAt','expiresAt','externalReferenceVerified','privacyApproved','target','tools'];
 check(a&&Object.keys(a).length===fields.length&&fields.every(k=>Object.hasOwn(a,k))&&a.kind==='two-sides-atlas-v2-first-read-once'&&/^[a-f0-9]{32}$/.test(runId)&&a.runId===runId);
 const start=Date.parse(a.issuedAt),end=Date.parse(a.expiresAt);check(Number.isFinite(start)&&Number.isFinite(end)&&start<=now&&now<end&&end>start&&end-start<=900000&&a.externalReferenceVerified===true&&a.privacyApproved===true);
 check(JSON.stringify(a.target)===JSON.stringify({host:'twosidescluster.fxqeo8o.mongodb.net',database:'two_sides_db',user:'twosides_backend_v2',authSource:'admin',authMechanism:'SCRAM-SHA-256',tls:true}));
 const names=['receiver.mjs','gate.mjs','probe.mjs','send-first-read.ps1'];check(a.tools&&Object.keys(a.tools).length===4&&names.every(n=>/^[a-f0-9]{64}$/.test(a.tools[n])&&a.tools[n]===toolHashes[n]));
 return true;
}
export function claimOnce(directory,runId){
 check(/^[a-f0-9]{32}$/.test(runId));regularPath(directory,{directory:true});
 check(!fs.existsSync(path.join(directory,'result.json')));
 fs.writeFileSync(path.join(directory,'used.json'),JSON.stringify({runId,startedAt:new Date().toISOString()}),{flag:'wx'});
}
