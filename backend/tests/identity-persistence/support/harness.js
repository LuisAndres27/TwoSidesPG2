import { execFileSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./private-workspace.ps1', import.meta.url));
export function workspace(operation, directory) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script,
      '-Operation', operation, ...(directory ? ['-Directory', directory] : [])],
    { encoding: 'utf8', windowsHide: true, timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch { throw new Error('Synthetic private workspace check failed'); }
}
export function child(input) {
  return new Promise((resolve, reject) => {
    const worker = fork(fileURLToPath(new URL('./restart-worker.js', import.meta.url)), [], {
      execArgv: ['--import', new URL('../../jwt/env-guard.js', import.meta.url).href],
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, LOCALAPPDATA: process.env.LOCALAPPDATA, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
    });
    let message, output = false;
    const timer = setTimeout(() => { worker.kill(); reject(new Error('Synthetic worker timeout')); }, 20000);
    worker.stdout.on('data', () => { output = true; });
    worker.stderr.on('data', () => { output = true; });
    worker.on('error', () => { clearTimeout(timer); reject(new Error('Synthetic worker unavailable')); });
    worker.on('message', value => { message = value; });
    worker.on('close', code => {
      clearTimeout(timer);
      if (code !== 0 || output || !message?.ok) reject(new Error('Synthetic worker failed: ' +
        (['repository', 'keys', 'listener', 'registration', 'session'].includes(message?.stage) ? message.stage : 'bootstrap') +
        '; exit=' + code + '; output=' + output));
      else resolve(message);
    });
    worker.send(input);
  });
}

