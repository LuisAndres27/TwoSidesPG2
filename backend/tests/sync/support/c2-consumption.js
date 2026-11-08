import fs from 'node:fs';
import path from 'node:path';

// Test double of what the launcher records before it asks for a secret (see consumptionRecordPath in c2-receiver-core.js).
// Lives next to the release in a disposable base; returns the file so a test can register it for cleanup.
export function writeConsumption(release,executionId,manifestSha256,patch={}){
  const directory=path.join(path.dirname(release),'consumed'),file=path.join(directory,path.basename(release)+'.json');
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(file,JSON.stringify({version:1,releaseId:path.basename(release),executionId,manifestSha256,reservedAtUtc:new Date().toISOString(),...patch}),{flag:'w'});
  return file;
}
