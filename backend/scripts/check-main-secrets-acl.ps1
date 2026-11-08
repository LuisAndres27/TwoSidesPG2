# READ-ONLY check of the private secrets directory of the main backend. It reads security descriptors and file NAMES/SIZES only: it never opens a file, prints no
# contents, changes no ACL or owner, and creates or deletes nothing. Exit code: 0 = conforming, 1 = failures, 2 = directory absent.
#   .\check-main-secrets-acl.ps1                                   checks %LOCALAPPDATA%\TwoSidesMainSecrets
#   .\check-main-secrets-acl.ps1 -Directory C:\path\to\folder      checks another folder (it must still be outside the project and OneDrive)
param([string]$Directory = (Join-Path $env:LOCALAPPDATA 'TwoSidesMainSecrets'))
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'main-secrets-acl-lib.ps1')
$projectRoot = Split-Path -Parent ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')))
if ($Directory -notmatch '^[A-Za-z]:\\[^"]+$') { Write-Error 'The directory must be an absolute path.'; exit 1 }
$full = [IO.Path]::GetFullPath($Directory)
if ($full.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase) -or $full -match '\\OneDrive[^\\]*(\\|$)') { Write-Error 'The secrets directory must be outside the project and OneDrive.'; exit 1 }
if (-not (Test-Path -LiteralPath $full)) { @{ mainSecretsAcl = 'absent'; directory = $full } | ConvertTo-Json -Compress; exit 2 }
$me = [Security.Principal.WindowsIdentity]::GetCurrent().User
$report = [ordered]@{ mainSecretsAcl = 'checked'; directory = $full; directoryFailures = @(); items = @() }
$item = Get-Item -LiteralPath $full -Force
if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $report.directoryFailures = @('not_a_plain_directory') }
else { $report.directoryFailures = @(Get-SecretsAclFailures -Security (Get-Acl -LiteralPath $full) -UserSid $me -IsDirectory $true -ExpectProtected $true) }
$bad = $report.directoryFailures.Count
if ($item.PSIsContainer) {
    foreach ($child in Get-ChildItem -LiteralPath $full -Recurse -Force) {
        $row = [ordered]@{ path = $child.FullName.Substring($full.Length).TrimStart('\'); kind = $(if ($child.PSIsContainer) { 'directory' } else { 'file' }); bytes = $(if ($child.PSIsContainer) { 0 } else { $child.Length }); failures = @() }
        if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { $row.failures = @('link') }
        else { $row.failures = @(Get-SecretsAclFailures -Security (Get-Acl -LiteralPath $child.FullName) -UserSid $me -IsDirectory $child.PSIsContainer -ExpectProtected $false) }
        # The 32 KiB limit is the private-key limit of the loader: it applies to anything under keys\ and to .pem/.key files, NOT to other files (e.g. the integrity manifest).
        $isKeyMaterial = $row.path -like 'keys\*' -or $child.Extension -in '.pem', '.key'
        if (-not $child.PSIsContainer -and $isKeyMaterial -and $child.Length -gt 32768) { $row.failures += 'key_file_too_large' }
        $bad += $row.failures.Count; $report.items += $row
    }
}
$report.verdict = $(if ($bad -eq 0) { 'conforming' } else { 'not_conforming' })
$report | ConvertTo-Json -Depth 5 -Compress
if ($bad -eq 0) { exit 0 } else { exit 1 }
