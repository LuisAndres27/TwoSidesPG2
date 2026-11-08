// The release remains offline-only: activation rejects BEFORE stdin or any connection.
// The future one-use connection/composition is installed but cannot bypass the gate.
// Never print, log or rethrow input, credentials, stacks or configuration.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseReceiverArgs,runReceiver } from './c2-receiver-core.js';
import { openC2Integration,runC2Integration } from './c2-release-integration.js';

try {
  const args=parseReceiverArgs(process.argv.slice(2));
  const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const manifestBytes=fs.readFileSync(path.join(path.dirname(packageRoot),'manifest.json'));
  const manifestSha256=createHash('sha256').update(manifestBytes).digest('hex').toUpperCase();
  const result=await runReceiver({args,env:process.env,manifest:JSON.parse(manifestBytes.toString('utf8')),manifestSha256,packageRoot,
    stdin:process.stdin,
    openIntegration:options=>openC2Integration({...options,recordPlan:plan=>fs.writeFileSync(path.join(path.dirname(args.result),'synthetic-plan.json'),JSON.stringify(plan)+'\n',{flag:'wx'}),activation:{manifest:JSON.parse(manifestBytes.toString('utf8')),
      context:{runId:args.runId,releaseId:path.basename(path.dirname(packageRoot)),manifestSha256,expectedManifestSha256:args.manifestSha256,now:Date.now()}}}),
    execute:runC2Integration});
  process.exitCode=result.status==='passed'?0:1;
} catch {
  process.exitCode=1;
}
