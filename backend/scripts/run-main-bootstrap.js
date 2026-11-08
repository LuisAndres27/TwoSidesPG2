// One-shot bootstrap of the main_v2 schema in two_sides_db. DISABLED by default; see src/main/bootstrap.js for every precondition.
// Do not run this directly: use run-main-bootstrap.ps1, which reads the password with hidden input and passes it on stdin.
import { bootstrapFailureReport, runMainBootstrap } from '../src/main/bootstrap.js';

try {
  await runMainBootstrap({
    argv: process.argv.slice(2), stdin: process.stdin, stdout: process.stdout,
    loadMongoose: async () => (await import('mongoose')).default,
  });
  process.exit(0);
} catch (error) {
  process.stderr.write(bootstrapFailureReport(error));
  process.exit(1);
}
