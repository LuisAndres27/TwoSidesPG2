// One-shot, read-only inspection of the main database schema (two_sides_db). DISABLED by default; see src/main/inspection.js for every precondition.
// Do not run this directly: use run-main-inspection.ps1, which reads the password with hidden input and passes it on stdin.
import { inspectionFailureReport, runMainInspection } from '../src/main/inspection.js';

try {
  await runMainInspection({
    argv: process.argv.slice(2), stdin: process.stdin, stdout: process.stdout,
    loadMongoose: async () => (await import('mongoose')).default,
  });
  process.exit(0);
} catch (error) {
  process.stderr.write(inspectionFailureReport(error));
  process.exit(1);
}
