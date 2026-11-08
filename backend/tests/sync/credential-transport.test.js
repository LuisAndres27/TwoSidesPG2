import './support/isolation-guard.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// B05.5 stage 8: how the password travels from the hidden prompt of run-integration-backend.ps1 to the Node process, offline. The test splices the
// REAL credential-handling section of the shipped script behind a test header (fictitious passwords, a probe instead of the launcher) and runs it in
// Windows PowerShell 5.1. Nothing connects anywhere and no real credential exists in this file.
const backendRoot = fileURLToPath(new URL('../../', import.meta.url));
const script = fs.readFileSync(path.join(backendRoot, 'scripts', 'run-integration-backend.ps1'), 'utf8');
const header = fs.readFileSync(path.join(backendRoot, 'tests', 'sync', 'support', 'credential-harness.ps1'), 'utf8');
const probe = path.join(backendRoot, 'tests', 'sync', 'support', 'credential-probe.mjs');
const body = script.slice(script.indexOf('$bstr = [IntPtr]::Zero'));
const windows = process.platform === 'win32';
let temp, runner;
beforeEach(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'two-sides-cred-')); runner = path.join(temp, 'run.ps1'); fs.writeFileSync(runner, '﻿' + header + body); });
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

const names = ['ascii', 'specials', 'spaces', 'latin1', 'cjk', 'astral (surrogate pair)', '1024 bytes', '1025 bytes', 'quotes and backslashes', 'leading U+FEFF', 'combining mark', 'shell-looking text', 'high code units', 'NUL', 'CR', 'LF'];
const run = (index, codePage = 0) => {
  const out = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', runner, '-Index', String(index), '-Probe', probe, '-CodePage', String(codePage)], { encoding: 'utf8', timeout: 60000, env: { ...process.env, TWO_SIDES_TEST_NODE: process.execPath } });
  const lines = (out.stdout ?? '').split(/\r?\n/).filter(Boolean);
  const expected = JSON.parse(lines.find(l => l.startsWith('EXPECTED '))?.slice(9) ?? 'null');
  const reported = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(j => j && 'ok' in j) ?? null;
  return { status: out.status, expected, reported, text: (out.stdout ?? '') + (out.stderr ?? '') };
};

describe.skipIf(!windows)('credential transport (Windows PowerShell 5.1 -> Node)', () => {
  it('CT01 every accepted password arrives byte for byte: ASCII, specials, spaces, Unicode, astral, U+FEFF and code units above U+8000', () => {
    for (const index of [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
      const r = run(index);
      expect(r.reported, names[index] + ': ' + r.text.slice(0, 300)).toMatchObject({ ok: true, bytes: r.expected.bytes, sha256: r.expected.sha256 });
    }
  }, 180000);

  it('CT02 the encoding does not depend on the console code page: UTF-8 (65001), 850 and 1252 all deliver the same bytes, with no BOM', () => {
    let original = 0;   // the console is shared with other tests: the code page is put back at the end
    try {
      for (const codePage of [850, 65001, 1252]) for (const index of [3, 4, 5]) {
        const r = run(index, codePage);
        original ||= Number(r.text.match(/ORIGINALCP (\d+)/)?.[1] ?? 0);
        if (r.text.includes('NOCONSOLE')) continue;                                   // no console to switch: that code page cannot be exercised here
        expect(r.reported, `${names[index]} cp${codePage}: ${r.text.slice(0, 200)}`).toMatchObject({ ok: true, sha256: r.expected.sha256 });
      }
    } finally { if (original) run(0, original); }
  }, 180000);

  it('CT03 invalid credentials never start the child: over 1024 bytes, NUL, CR and LF are refused by the wrapper', () => {
    for (const index of [7, 13, 14, 15]) {
      const r = run(index);
      expect(r.status, names[index]).not.toBe(0); expect(r.reported, names[index]).toBeNull(); expect(r.text).toContain('Invalid credential');
    }
  }, 120000);

  it('CT04 the secret is not in the child arguments, its environment or any file, and the environment holds only the three fixed names', () => {
    for (const index of [1, 3, 5]) {
      const r = run(index);
      expect(r.reported.leaks).toBe(0);
      expect(r.reported.envNames.map(n => n.toLowerCase()).sort()).toEqual(['path', 'systemroot', 'windir'].sort());
      expect(r.text).not.toMatch(/p@ss|contrase|smile/i);                               // the wrapper prints nothing of the password; run.ps1 itself holds the fictitious cases by design
      for (const f of fs.readdirSync(temp).filter(n => n !== 'run.ps1')) expect(fs.readFileSync(path.join(temp, f), 'latin1')).not.toMatch(/P@ss|Contrase|smile/);
    }
  }, 120000);

  it('CT05 the shipped script keeps its locks: hidden input, -Enable, an absolute non-link authorization path, a cleared environment and no secret in arguments', () => {
    expect(script).toContain("Read-Host -Prompt 'Password of the integration user (hidden input)' -AsSecureString");
    expect(script).toContain("if (-not $Enable)"); expect(script).toContain('$info.Environment.Clear()');
    expect(script).toContain('RedirectStandardInput = $true'); expect(script).toMatch(/\[Array\]::Clear\(\$frame/);
    expect(script).not.toMatch(/ConvertFrom-SecureString|Write-Host\s+\$|Write-Output\s+\$(chars|bytes|secure)|Out-File|Set-Content|\$env:[A-Z_]*PASS/i);
    expect(script).toMatch(/Authorization -notmatch '\^\[A-Za-z\]:/); expect(script).toContain('ReparsePoint');
    const args = script.match(/\$info\.Arguments = [^\n]+/)[0]; expect(args).not.toMatch(/\$(secure|chars|bytes|frame|pass)/i);
  });
});
