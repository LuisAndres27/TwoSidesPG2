// Manual launcher of the Express 'integration' profile (Atlas). DISABLED by default; see src/integration/launcher.js for every precondition.
// Do not run this directly: use run-integration-backend.ps1, which reads the password with hidden input and passes it on stdin.
import { failureReport, main } from '../src/integration/launcher.js';

let running;
try {
  running = await main({
    argv: process.argv.slice(2), stdin: process.stdin, stdout: process.stdout,
    loadMongoose: async () => (await import('mongoose')).default,
  });
} catch (error) {
  process.stderr.write(failureReport(error));
  process.exit(1);
}

if (running.authCheck) process.exit(0);   // authenticated, inspected and closed; nothing was served or written
if (running.syntheticResult) process.exit(running.syntheticResult.success ? 0 : 2);   // the scenario already closed HTTP and MongoDB

let stopping = false;
const stop = async () => {
  if (stopping) return; stopping = true;
  try { await running.close({ graceMs: 5000 }); process.exit(0); } catch { process.exit(1); }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
