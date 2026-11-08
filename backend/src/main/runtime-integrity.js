import {runPreflight} from '../../scripts/main-preflight.js';
import {MainError} from './policy.js';
// Mandatory on the process entry point too: invoking node directly cannot silently skip the wrapper's manifest check.
export async function verifyRuntimeIntegrity(config,env=process.env){
  const args={manifest:env.MAIN_INTEGRITY_MANIFEST,anchor:env.MAIN_INTEGRITY_ANCHOR,keyFingerprint:env.MAIN_KEY_FINGERPRINT,
    expectedKeyId:env.MAIN_EXPECTED_KEY_ID,keyFile:config.keyFile,keyId:config.keyId};
  if(typeof args.manifest!=='string'||!args.manifest||!(/^[0-9a-f]{64}$/.test(args.anchor??''))||!(/^[0-9a-f]{64}$/.test(args.keyFingerprint??''))||!args.expectedKeyId)
    throw new MainError('main_integrity_required');
  if(!(await runPreflight(args)).ok)throw new MainError('main_integrity_rejected');
}
