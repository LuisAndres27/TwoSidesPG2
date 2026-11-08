# Test-only header. credential-transport.test.js concatenates it with the REAL credential-handling section of scripts/run-integration-backend.ps1
# (from `$bstr = [IntPtr]::Zero` to the end), so the code under test is the shipped code, not a copy. Everything here is ASCII; the fictitious
# passwords are built from code points. Only the node probe (not the real launcher) is started, and nothing connects anywhere.
param([int]$Index, [string]$Probe, [int]$CodePage = 0)
$ErrorActionPreference = 'Stop'
function U([int]$cp) { [char]::ConvertFromUtf32($cp) }
$cases = @(
  'Abc123xyz',
  ('P@ss w0rd!#$%^&*()_+-=[]{};' + "'" + ':",.<>/?\|~' + [char]96 + '`n'),
  '  pad with spaces  ',
  ('Contrase' + (U 0xF1) + 'a-' + (U 0xC1) + (U 0xC9) + (U 0xCD)),
  ((U 0x5BC6) + (U 0x7801) + (U 0x30C6) + (U 0x30B9) + (U 0x30C8)),
  ('smile' + (U 0x1F600) + 'end' + (U 0x1F510)),
  ('a' * 1024),
  ('a' * 1025),
  'a"b\c"d\\',
  ((U 0xFEFF) + 'x'),
  ('e' + (U 0x301) + 'x'),
  ('%PATH% $env:PATH ' + [char]96 + 'r ; & | > <'),
  ((U 0xFFFD) + (U 0x8000) + (U 0xFFFF) + 'z'),
  ('ab' + [char]0 + 'c'),
  ('ab' + [char]13 + 'c'),
  ('ab' + [char]10 + 'c')
)
# The console input code page is what System.Diagnostics.Process uses to wrap the child's stdin; without a console the case is reported as skipped.
if ($CodePage -gt 0) {
  try { Write-Output ('ORIGINALCP ' + [Console]::InputEncoding.CodePage); [Console]::InputEncoding = [Text.Encoding]::GetEncoding($CodePage) } catch { Write-Output 'NOCONSOLE' }
}
$fake = $cases[$Index]
$expected = [Text.Encoding]::UTF8.GetBytes($fake)
$sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($expected)).Replace('-', '').ToLower()
Write-Output ('EXPECTED ' + (@{ bytes = $expected.Length; sha256 = $sha } | ConvertTo-Json -Compress))
$secure = ConvertTo-SecureString $fake -AsPlainText -Force
$Authorization = 'C:\x\launch-authorization.json'; $Port = 3000; $PrepareCollections = [switch]$false; $SyntheticRun = [switch]$false; $AuthCheck = [switch]$false; $Enable = $true
$node = $env:TWO_SIDES_TEST_NODE; $launcher = $Probe
$backend = Split-Path -Parent $Probe
Set-StrictMode -Version Latest
