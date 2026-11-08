# Manual launcher of the Express 'integration' profile (MongoDB Atlas, two_sides_integration_test). Windows only.
# DISABLED BY DEFAULT: it does nothing unless -Enable is given, and the backend additionally requires a valid launch authorization file that
# THIS REPOSITORY DOES NOT CONTAIN. The password is read with hidden input and sent to the child process on stdin as one length-prefixed frame:
# it never appears in arguments, environment variables, files or output. backend/.env is never read.
#
#   .\run-integration-backend.ps1 -Enable -Authorization C:\path\to\launch-authorization.json [-Port 3000] [-PrepareCollections] [-SyntheticRun] | -AuthCheck (authenticate + read-only inspection only)
param(
    [switch]$Enable,
    [Parameter(Mandatory = $true)][string]$Authorization,
    [ValidateRange(1, 65535)][int]$Port = 3000,
    [switch]$PrepareCollections,
    [switch]$SyntheticRun,
    [switch]$AuthCheck
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $Enable) { Write-Error 'Integration launcher disabled: pass -Enable explicitly.'; exit 1 }
$node = 'C:\Program Files\nodejs\node.exe'
$launcher = Join-Path $PSScriptRoot 'run-integration-backend.js'
$backend = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not (Test-Path -LiteralPath $node -PathType Leaf) -or -not (Test-Path -LiteralPath $launcher -PathType Leaf)) { Write-Error 'Required files are missing.'; exit 1 }
if ($Authorization -notmatch '^[A-Za-z]:\\[^"]+$' -or -not (Test-Path -LiteralPath $Authorization -PathType Leaf)) { Write-Error 'The authorization file must be an existing absolute path.'; exit 1 }
if ((Get-Item -LiteralPath $Authorization).Attributes -band [IO.FileAttributes]::ReparsePoint) { Write-Error 'The authorization file must not be a link.'; exit 1 }

if ($AuthCheck -and ($PrepareCollections -or $SyntheticRun)) { Write-Error '-AuthCheck cannot be combined with -PrepareCollections or -SyntheticRun.'; exit 1 }   # refused before any prompt
$secure = Read-Host -Prompt 'Password of the integration user (hidden input)' -AsSecureString
$bstr = [IntPtr]::Zero; $chars = $null; $bytes = $null; $frame = $null; $process = $null; $consoleInput = $null
try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $chars = New-Object 'char[]' $secure.Length
    for ($i = 0; $i -lt $chars.Length; $i++) { $chars[$i] = [char]([Runtime.InteropServices.Marshal]::ReadInt16($bstr, 2 * $i) -band 0xFFFF) }   # ReadInt16 is signed: code units >= U+8000 (CJK, surrogates, U+FEFF) must not overflow [char]
    $bytes = [Text.Encoding]::UTF8.GetBytes($chars)
    if ($bytes.Length -lt 1 -or $bytes.Length -gt 1024 -or ($chars -contains "`r") -or ($chars -contains "`n") -or ($chars -contains [char]0)) { Write-Error 'Invalid credential.'; exit 1 }
    $frame = New-Object 'byte[]' (4 + $bytes.Length)
    $frame[0] = ($bytes.Length -shr 24) -band 255; $frame[1] = ($bytes.Length -shr 16) -band 255; $frame[2] = ($bytes.Length -shr 8) -band 255; $frame[3] = $bytes.Length -band 255
    [Array]::Copy($bytes, 0, $frame, 4, $bytes.Length)

    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $node; $info.WorkingDirectory = $backend
    $info.UseShellExecute = $false; $info.RedirectStandardInput = $true       # output stays on this console
    # Windows PowerShell 5.1 has no ArgumentList: the command line is built from fixed text, validated paths (no quotes) and an integer.
    $info.Arguments = '"' + $launcher + '" --enable-integration --authorization "' + $Authorization + '" --port ' + [string]$Port
    if ($AuthCheck) { $info.Arguments = '"' + $launcher + '" --enable-integration --authorization "' + $Authorization + '"' }
    if ($PrepareCollections) { $info.Arguments += ' --prepare-collections' }
    if ($SyntheticRun) { $info.Arguments += ' --synthetic-run' }
    if ($AuthCheck) { $info.Arguments += ' --auth-check' }
    $info.Environment.Clear()                                                  # nothing inherited: no secrets, no NODE_OPTIONS, no proxy
    $windows = [Environment]::GetFolderPath('Windows')
    $info.Environment['SystemRoot'] = $windows; $info.Environment['windir'] = $windows; $info.Environment['PATH'] = Join-Path $windows 'System32'
    # Process wraps stdin in a StreamWriter over the console input code page; with UTF-8 (65001) that writer prepends a BOM to the frame. Use a code page
    # without a preamble while the child starts (the frame itself is written as raw bytes below) and restore the original afterwards.
    $consoleInput = [Console]::InputEncoding
    if ($consoleInput.GetPreamble().Length -gt 0) { [Console]::InputEncoding = [Text.Encoding]::GetEncoding(1252) } else { $consoleInput = $null }
    try { $process = [Diagnostics.Process]::Start($info) } finally { if ($consoleInput) { [Console]::InputEncoding = $consoleInput; $consoleInput = $null } }
    $process.StandardInput.BaseStream.Write($frame, 0, $frame.Length)
    $process.StandardInput.BaseStream.Flush(); $process.StandardInput.Close()
    [Array]::Clear($frame, 0, $frame.Length); [Array]::Clear($bytes, 0, $bytes.Length); [Array]::Clear($chars, 0, $chars.Length)
    $process.WaitForExit()
    exit $process.ExitCode
}
finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ($secure) { $secure.Dispose() }
    foreach ($buffer in @($frame, $bytes, $chars)) { if ($buffer) { [Array]::Clear($buffer, 0, $buffer.Length) } }
    # Ctrl+C reaches the child too (same console) and closes MongoDB in order; give it time, then stop it.
    if ($process -and -not $process.HasExited) { if (-not $process.WaitForExit(10000)) { $process.Kill() } }
}
