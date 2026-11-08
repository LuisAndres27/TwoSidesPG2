param([ValidateSet('Create','Verify','Remove')][string]$Operation='Verify',[string]$Directory)
$ErrorActionPreference='Stop'
$base=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'TwoSides')).TrimEnd('\')
$userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed=@($userSid,'S-1-5-18','S-1-5-32-544')
function Assert-Private([string]$p) {
  $item=Get-Item -LiteralPath $p -Force
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse path rejected'}
  $acl=Get-Acl -LiteralPath $p
  if($acl.Owner -ne [Security.Principal.WindowsIdentity]::GetCurrent().Name){throw 'Unexpected owner'}
  foreach($ace in $acl.Access) {
    if($ace.AccessControlType -eq 'Allow' -and $allowed -notcontains $ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value){throw 'Private access not established'}
  }
}
# Existing private parent only. Never create or change its ACL.
Assert-Private $base
if($Operation -eq 'Create'){
  $Directory=Join-Path $base ('identity-d2-'+[guid]::NewGuid().ToString())
  [IO.Directory]::CreateDirectory($Directory) | Out-Null
}
$resolved=[IO.Path]::GetFullPath($Directory).TrimEnd('\')
if([IO.Path]::GetDirectoryName($resolved) -ne $base -or [IO.Path]::GetFileName($resolved) -notmatch '^identity-d2-[0-9a-f-]{36}$'){throw 'Out of scope directory'}
Assert-Private $resolved
$pending=[Collections.Generic.Stack[string]]::new()
$pending.Push($resolved)
while($pending.Count -gt 0){
  $current=$pending.Pop()
  foreach($item in @(Get-ChildItem -LiteralPath $current -Force)){
    Assert-Private $item.FullName
    if($item.PSIsContainer){$pending.Push($item.FullName)}
  }
}
if($Operation -eq 'Remove'){
  # Absolute target verified above; only this run-owned UUID directory.
  Remove-Item -LiteralPath $resolved -Recurse -Force
  if(Test-Path -LiteralPath $resolved){throw 'Synthetic cleanup failed'}
}else{Write-Output $resolved}

