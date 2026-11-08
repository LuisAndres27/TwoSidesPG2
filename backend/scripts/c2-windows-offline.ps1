param(
  [string]$RuntimePath,
  [string]$ManifestSha256,
  [string]$RunId,
  [string]$AtlasHost='twosidescluster.fxqeo8o.mongodb.net',
  [string]$Database='two_sides_integration_test',
  [string]$User='twosides_integration_test'
)
# Offline only: no Read-Host, credentials, stdin receiver, Atlas or real C.2.
$ErrorActionPreference='Stop'
$heldFiles=New-Object 'System.Collections.Generic.List[System.IDisposable]'
$child=$null
function Assert-C2($condition){if(!$condition){throw 'C2_OFFLINE_REJECTED'}}
function Get-C2Files($directory){
  $pending=New-Object 'System.Collections.Generic.Stack[string]';$pending.Push($directory)
  while($pending.Count){
    $folder=$pending.Pop()
    Test-C2Acl $folder $script:C2Allowed
    foreach($item in Get-ChildItem -LiteralPath $folder -Force){
      Assert-C2 (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0)
      if($item.PSIsContainer){$pending.Push($item.FullName)}else{$item.FullName}
    }
  }
}
function Test-C2Acl($itemPath,$allowed){
  $acl=Get-Acl -LiteralPath $itemPath
  $owner=(New-Object Security.Principal.NTAccount($acl.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value
  Assert-C2 ($allowed -contains $owner)
  $writeMask=[Security.AccessControl.FileSystemRights]'Write,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
  foreach($ace in $acl.Access){
    $sid=$ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    Assert-C2 ($script:ForbiddenSids -notcontains $sid)
    if($ace.AccessControlType -eq 'Allow' -and ($ace.FileSystemRights -band $writeMask) -ne 0){Assert-C2 ($allowed -contains $sid)}
  }
}
try {
  Assert-C2 ($args.Count -eq 0 -and $ManifestSha256 -match '^[A-Fa-f0-9]{64}$' -and $RunId -match '^[a-f0-9]{32}$')
  Assert-C2 ($AtlasHost -ceq 'twosidescluster.fxqeo8o.mongodb.net' -and $Database -ceq 'two_sides_integration_test' -and $User -ceq 'twosides_integration_test')
  foreach($name in [Environment]::GetEnvironmentVariables().Keys){
    Assert-C2 ($name -notmatch '^(NODE_(OPTIONS|PATH|COMPILE_CACHE)|NAPI_RS_|LD_|DYLD_|MONGO|DOTENV|NPM_CONFIG_)')
  }
  Assert-C2 (!$env:NODE_ENV -or $env:NODE_ENV -ceq 'test')
  $base=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'TwoSides\C2Runtime')).TrimEnd('\')
  $root=[IO.Path]::GetFullPath($RuntimePath).TrimEnd('\')
  Assert-C2 ([IO.Path]::GetDirectoryName($root) -ceq $base -and [IO.Path]::GetFileName($root) -match '^c2-[a-f0-9]{32}$')
  Assert-C2 ($root -notmatch '["\r\n]' -and $root -notmatch '\\OneDrive[^\\]*\\')
  $cursor=$root
  while($cursor){$item=Get-Item -LiteralPath $cursor -Force;Assert-C2 ($item.PSIsContainer -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0);$cursor=[IO.Path]::GetDirectoryName($cursor)}
  $manifestPath=Join-Path $root 'manifest.json'
  $heldFiles.Add([IO.File]::Open($manifestPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
  Assert-C2 ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ceq $ManifestSha256.ToUpperInvariant())
  $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-C2 ($manifest.mode -ceq 'offline-only' -and $manifest.remoteEnabled -eq $false -and $manifest.version -eq 1)
  Assert-C2 ($manifest.target.host -ceq $AtlasHost -and $manifest.target.database -ceq $Database -and $manifest.target.user -ceq $User -and $manifest.target.authSource -ceq 'admin' -and $manifest.target.authMechanism -ceq 'DEFAULT' -and $manifest.target.tls -eq $true)
  $script:ForbiddenSids=@($manifest.forbiddenSids)
  Assert-C2 ($script:ForbiddenSids.Count -eq 2)
  $currentSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allowed=@($currentSid,'S-1-5-18','S-1-5-32-544')
  $script:C2Allowed=$allowed
  Test-C2Acl $base $allowed;Test-C2Acl $root $allowed
  $package=Join-Path $root 'package'
  Test-C2Acl $package $allowed
  $expected=@{};foreach($entry in $manifest.files){
    Assert-C2 ($entry.path -notmatch '(^|/)\.env|\.sqlite|(^|/)\.\.?(/|$)|[:\\]' -and $entry.sha256 -match '^[A-F0-9]{64}$')
    Assert-C2 (!$expected.ContainsKey($entry.path));$expected[$entry.path]=$entry.sha256
  }
  $actual=@(Get-C2Files $package);Assert-C2 ($actual.Count -eq $expected.Count)
  foreach($file in $actual){
    $relative=$file.Substring($package.Length+1).Replace('\','/')
    Assert-C2 ($expected.ContainsKey($relative))
    $heldFiles.Add([IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
    Assert-C2 ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ceq $expected[$relative]);Test-C2Acl $file $allowed
  }
  $node='C:\Program Files\nodejs\node.exe'
  Assert-C2 ($manifest.node.sha256 -ceq '3602F2BB1A10F2CBAB4C36886218A33C1AB3DB87290E73B033C46C77147D0237')
  $heldFiles.Add([IO.File]::Open($node,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
  Assert-C2 ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ceq $manifest.node.sha256)
  $runs=Join-Path $root 'runs';$run=Join-Path $runs $RunId
  Assert-C2 (!(Test-Path -LiteralPath $run))
  [IO.Directory]::CreateDirectory($run)|Out-Null;Test-C2Acl $run $allowed
  $marker=Join-Path $run 'offline-attempt.started'
  $claim=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$claim.Dispose()
  $entrypoint=Join-Path $package 'scripts\c2-windows-offline-entry.js';$resultPath=Join-Path $run 'result.json'
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$node;$info.Arguments='"'+$entrypoint+'" --offline-result "'+$resultPath+'" --run-id '+$RunId
  $info.WorkingDirectory=$package;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.EnvironmentVariables.Clear()
  $info.EnvironmentVariables['SystemRoot']=[Environment]::GetFolderPath('Windows')
  $info.EnvironmentVariables['WINDIR']=[Environment]::GetFolderPath('Windows')
  $info.EnvironmentVariables['SystemDrive']=[IO.Path]::GetPathRoot($node).TrimEnd('\')
  $info.EnvironmentVariables['LOCALAPPDATA']=[Environment]::GetFolderPath('LocalApplicationData')
  $info.EnvironmentVariables['PATH']=(Join-Path ([Environment]::GetFolderPath('Windows')) 'System32')
  $info.EnvironmentVariables['TEMP']=(Join-Path $root 'temp');$info.EnvironmentVariables['TMP']=(Join-Path $root 'temp')
  $info.EnvironmentVariables['NODE_ENV']='test'
  $child=New-Object Diagnostics.Process;$child.StartInfo=$info;Assert-C2 ($child.Start())
  $child.StandardInput.Close();$stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
  if(!$child.WaitForExit(120000)){$child.Kill();$child.WaitForExit(5000)|Out-Null;throw 'C2_OFFLINE_REJECTED'}
  Assert-C2 ($child.ExitCode -eq 0 -and $stdout.Result.Length -eq 0 -and $stderr.Result.Length -eq 0)
  $result=Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
  Assert-C2 ($result.status -ceq 'passed' -and $result.runId -ceq $RunId -and $result.atlasConnected -eq $false -and $result.remoteEnabled -eq $false)
  Assert-C2 (@(Get-C2Files $package).Count -eq $expected.Count)
  Write-Output 'Validacion offline completada. Atlas permanece deshabilitado.'
} catch {
  Write-Output 'Validacion offline rechazada. No se muestran detalles ni entradas.'
  exit 1
} finally {
  if($child){try{if(!$child.HasExited){$child.Kill();$child.WaitForExit(5000)|Out-Null}}catch{};$child.Dispose()}
  foreach($handle in $heldFiles){$handle.Dispose()}
}
