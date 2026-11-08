param(
  [string]$ManifestSha256,
  [string]$RunId
)
# C.2 one-use receiver launcher. NOT ACTIVATABLE in this state: it needs a manifest with mode 'c2-remote-once',
# remoteEnabled=true and an activation block bound to this RunId, and no such manifest exists. The sealed release is offline-only.
# The password (never an argument, variable, file or log) is read hidden, framed in RAM and written once to the child's anonymous stdin.
# Target, user, database, mechanism and TLS are constants of the manifest and of the child; no parameter can change them.
$ErrorActionPreference='Stop'
$script:C2Fixed=@{AtlasHost='twosidescluster.fxqeo8o.mongodb.net';User='twosides_integration_test';Database='two_sides_integration_test';
  AuthSource='admin';AuthMechanism='DEFAULT';ExecutionScope='10ef4f6d653f4ee4a1d1b2e6591013c2'}
$script:C2Node='C:\Program Files\nodejs\node.exe'
$script:C2BlockedParentNames='^(NODE_(OPTIONS|PATH|COMPILE_CACHE|DEBUG|EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED)|NAPI_RS_|LD_|DYLD_|MONGO|DOTENV|NPM_CONFIG_|OPENSSL_|SSL_CERT|HTTPS?_PROXY|ALL_PROXY)'

function Assert-C2($condition,[string]$stage='rejected'){if(!$condition){throw "C2_RECEIVER_REJECTED:$stage"}}

function Assert-C2Environment {
  foreach($name in [Environment]::GetEnvironmentVariables().Keys){Assert-C2 ($name -notmatch $script:C2BlockedParentNames) 'env'}
  Assert-C2 (!$env:NODE_ENV -or $env:NODE_ENV -ceq 'test') 'env'
}

function Test-C2Acl($itemPath,$allowed,$forbidden){
  $acl=Get-Acl -LiteralPath $itemPath
  $owner=(New-Object Security.Principal.NTAccount($acl.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value
  Assert-C2 ($allowed -contains $owner) 'acl'
  $writeMask=[Security.AccessControl.FileSystemRights]'Write,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
  foreach($ace in $acl.Access){
    $sid=$ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    Assert-C2 ($forbidden -notcontains $sid) 'acl'
    if($ace.AccessControlType -eq 'Allow' -and ($ace.FileSystemRights -band $writeMask) -ne 0){Assert-C2 ($allowed -contains $sid) 'acl'}
  }
}

function Get-C2Files($directory,$allowed,$forbidden){
  $pending=New-Object 'System.Collections.Generic.Stack[string]';$pending.Push($directory)
  while($pending.Count){
    $folder=$pending.Pop()
    Test-C2Acl $folder $allowed $forbidden
    foreach($item in Get-ChildItem -LiteralPath $folder -Force){
      Assert-C2 (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'inventory'
      if($item.PSIsContainer){$pending.Push($item.FullName)}else{$item.FullName}
    }
  }
}

# One-use gate, mirrored in c2-receiver-core.js. The offline manifest (mode 'offline-only') can never pass.
function Test-C2PayloadBinding($manifest,[string]$ReleaseId){
  Assert-C2 ($ReleaseId -cmatch '^c2-[a-f0-9]{32}$' -and $manifest.releaseId -ceq $ReleaseId -and $manifest.payloadSha256 -cmatch '^[A-F0-9]{64}$') 'binding'
  $seen=@{};$text=New-Object Text.StringBuilder
  foreach($entry in $manifest.files){
    Assert-C2 ($entry.path -and $entry.path -notmatch '[\x00\r\n\\:]|^/|(^|/)\.\.?(/|$)|//' -and $entry.sha256 -cmatch '^[A-F0-9]{64}$' -and !$seen.ContainsKey($entry.path)) 'binding'
    $seen[$entry.path]=$true;[void]$text.Append([string]$entry.path);[void]$text.Append([char]0);[void]$text.Append([string]$entry.sha256);[void]$text.Append([char]10)
  }
  $algorithm=[Security.Cryptography.SHA256]::Create()
  try{$actual=([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($text.ToString())))).Replace('-','')}finally{$algorithm.Dispose()}
  Assert-C2 ($actual -ceq $manifest.payloadSha256) 'binding'
}
# Same decisions as assertActivation in c2-receiver-core.js: exact key sets, strict types, strict instants, execution id != schema id.
function Test-C2Keys($object,[string[]]$names){
  Assert-C2 ($object -is [pscustomobject]) 'activation'
  $actual=@($object.PSObject.Properties.Name|Sort-Object -CaseSensitive)
  Assert-C2 (($actual -join '|') -ceq ((@($names)|Sort-Object -CaseSensitive) -join '|')) 'activation'
}
function Test-C2Activation($manifest,[string]$Id,[datetime]$NowUtc){
  $t=$manifest.target;$a=$manifest.activation
  Assert-C2 ($manifest.version -isnot [string] -and $manifest.version -eq 2 -and $manifest.mode -is [string] -and $manifest.mode -ceq 'c2-remote-once' -and $manifest.remoteEnabled -is [bool] -and $manifest.remoteEnabled) 'activation'
  Test-C2Keys $t @('host','user','database','authSource','authMechanism','tls')
  Assert-C2 ($t.host -is [string] -and $t.host -ceq $script:C2Fixed.AtlasHost -and $t.user -is [string] -and $t.user -ceq $script:C2Fixed.User -and $t.database -is [string] -and $t.database -ceq $script:C2Fixed.Database -and
    $t.authSource -is [string] -and $t.authSource -ceq $script:C2Fixed.AuthSource -and $t.authMechanism -is [string] -and $t.authMechanism -ceq $script:C2Fixed.AuthMechanism -and $t.tls -is [bool] -and $t.tls) 'activation'
  Test-C2Keys $a @('executionId','runId','scenarios','createdAtUtc','expiresAtUtc')
  $scenarios=$a.scenarios
  Assert-C2 ($scenarios -is [object[]] -and $scenarios.Count -eq 3 -and $scenarios[0] -is [string] -and $scenarios[0] -ceq 'A' -and $scenarios[1] -is [string] -and $scenarios[1] -ceq 'B' -and $scenarios[2] -is [string] -and $scenarios[2] -ceq 'C') 'activation'
  Assert-C2 ($a.executionId -is [string] -and $a.executionId -ceq $Id -and $a.runId -is [string] -and $a.runId -ceq $script:C2Fixed.ExecutionScope -and $a.executionId -cne $a.runId) 'activation'
  $instant='^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$'
  Assert-C2 ($a.createdAtUtc -is [string] -and $a.createdAtUtc -cmatch $instant -and $a.expiresAtUtc -is [string] -and $a.expiresAtUtc -cmatch $instant) 'activation'
  $style=[Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
  $created=[datetime]::Parse([string]$a.createdAtUtc,[Globalization.CultureInfo]::InvariantCulture,$style)
  $expires=[datetime]::Parse([string]$a.expiresAtUtc,[Globalization.CultureInfo]::InvariantCulture,$style)
  Assert-C2 ($expires -gt $created -and $NowUtc -ge $created.AddMinutes(-1) -and $NowUtc -lt $expires -and ($expires-$created).TotalHours -le 4) 'activation'
}

# KeySource yields ConsoleKeyInfo-like objects (Key, KeyChar). Returns [uint32 big-endian length][UTF-8 bytes], the wire format of
# receiveAtlasCredential. Characters live in a fixed char[] that is cleared; nothing is echoed and no string is built.
function Read-C2HiddenCredential([scriptblock]$KeySource,[int]$MinChars=8,[int]$MaxChars=256){
  $chars=New-Object 'char[]' $MaxChars;$count=0
  try{
    while($true){
      $key=& $KeySource
      if($key.Key -eq [ConsoleKey]::Enter){break}
      if($key.Key -eq [ConsoleKey]::Escape){throw 'C2_RECEIVER_REJECTED:input'}
      if($key.Key -eq [ConsoleKey]::Backspace){if($count -gt 0){$count--;$chars[$count]=[char]0};continue}
      $c=[char]$key.KeyChar
      if([char]::IsControl($c)){continue}
      Assert-C2 ($count -lt $MaxChars) 'input'
      $chars[$count]=$c;$count++
    }
    Assert-C2 ($count -ge $MinChars) 'input'
    $utf8=New-Object Text.UTF8Encoding($false,$true)
    $length=$utf8.GetByteCount($chars,0,$count)
    Assert-C2 ($length -le 1024) 'input'
    $frame=New-Object 'byte[]' (4+$length)
    $frame[0]=[byte](($length -shr 24) -band 255);$frame[1]=[byte](($length -shr 16) -band 255)
    $frame[2]=[byte](($length -shr 8) -band 255);$frame[3]=[byte]($length -band 255)
    [void]$utf8.GetBytes($chars,0,$count,$frame,4)
    return ,$frame
  }finally{[Array]::Clear($chars,0,$chars.Length)}
}

function Invoke-C2Receiver {
  param(
    [Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][string]$ManifestSha256,
    [Parameter(Mandatory=$true)][string]$RunId,
    [string]$ExpectedBase=(Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'TwoSides\C2Runtime'),
    [scriptblock]$KeySource={[Console]::ReadKey($true)}
  )
  $heldFiles=New-Object 'System.Collections.Generic.List[System.IDisposable]';$child=$null;$frame=$null
  try{
    Assert-C2Environment
    Assert-C2 ($ManifestSha256 -match '^[A-Fa-f0-9]{64}$' -and $RunId -cmatch '^[a-f0-9]{32}$' -and $RunId -cne $script:C2Fixed.ExecutionScope) 'args'
    $root=[IO.Path]::GetFullPath($Root).TrimEnd('\');$base=[IO.Path]::GetFullPath($ExpectedBase).TrimEnd('\')
    Assert-C2 ([IO.Path]::GetDirectoryName($root) -ceq $base -and [IO.Path]::GetFileName($root) -match '^c2-[a-f0-9]{32}$') 'path'
    Assert-C2 ($root -notmatch '["\r\n]' -and $root -notmatch '\\OneDrive[^\\]*\\') 'path'
    $cursor=$root
    while($cursor){$item=Get-Item -LiteralPath $cursor -Force;Assert-C2 ($item.PSIsContainer -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'path';$cursor=[IO.Path]::GetDirectoryName($cursor)}
    # The manifest is read through a handle that blocks writers, hashed against the digest read from the independent medium, then parsed.
    $manifestPath=Join-Path $root 'manifest.json'
    $heldFiles.Add([IO.File]::Open($manifestPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
    Assert-C2 ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash -ceq $ManifestSha256.ToUpperInvariant()) 'hash'
    $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Test-C2PayloadBinding $manifest ([IO.Path]::GetFileName($root))
    Test-C2Activation $manifest $RunId ([datetime]::UtcNow)
    Assert-C2 (!(Test-Path -LiteralPath (Join-Path (Join-Path $root 'runs') $RunId))) 'reuse'
    # A final release has no installation/cache/support residue outside its payload.
    foreach($rootItem in Get-ChildItem -LiteralPath $root -Force){Assert-C2 (@('package','manifest.json','runs','temp') -ccontains $rootItem.Name) 'layout'}
    foreach($mutableName in @('runs','temp')){
      $mutable=Get-Item -LiteralPath (Join-Path $root $mutableName) -Force
      Assert-C2 ($mutable.PSIsContainer -and ($mutable.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -and @(Get-ChildItem -LiteralPath $mutable.FullName -Force).Count -eq 0) 'temp'
    }
    $forbidden=@($manifest.forbiddenSids);Assert-C2 ($forbidden.Count -eq 2) 'acl'
    $allowed=@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18','S-1-5-32-544')
    Test-C2Acl $base $allowed $forbidden;Test-C2Acl $root $allowed $forbidden
    $package=Join-Path $root 'package';Test-C2Acl $package $allowed $forbidden
    $expected=@{}
    foreach($entry in $manifest.files){
      Assert-C2 ($entry.path -notmatch '(^|/)\.env|\.sqlite|(^|/)\.\.?(/|$)|[:\\]' -and $entry.sha256 -match '^[A-F0-9]{64}$') 'inventory'
      Assert-C2 (!$expected.ContainsKey($entry.path)) 'inventory';$expected[$entry.path]=$entry.sha256
    }
    $actual=@(Get-C2Files $package $allowed $forbidden);Assert-C2 ($actual.Count -eq $expected.Count) 'inventory'
    foreach($file in $actual){
      $relative=$file.Substring($package.Length+1).Replace('\','/')
      Assert-C2 ($expected.ContainsKey($relative)) 'inventory'
      $heldFiles.Add([IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
      Assert-C2 ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ceq $expected[$relative]) 'inventory';Test-C2Acl $file $allowed $forbidden
    }
    $node=$script:C2Node
    $heldFiles.Add([IO.File]::Open($node,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
    Assert-C2 ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash -ceq $manifest.node.sha256) 'node'
    $signature=Get-AuthenticodeSignature -LiteralPath $node
    Assert-C2 ($signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match 'O=OpenJS Foundation') 'node'
    $entrypoint=Join-Path $package 'scripts\c2-receiver-entry.js';Assert-C2 ($expected.ContainsKey('scripts/c2-receiver-entry.js')) 'inventory'
    if(!$PSBoundParameters.ContainsKey('KeySource')){Assert-C2 (![Console]::IsInputRedirected) 'console'}
    # Reserve the run BEFORE asking for the secret. A cancelled or failed attempt still consumes it.
    $run=Join-Path (Join-Path $root 'runs') $RunId;Assert-C2 (!(Test-Path -LiteralPath $run)) 'reuse'
    # Durable consumption record, outside the release and its runs folder. Created exclusively and never deleted by this code.
    $ledgerDir=Join-Path $base 'consumed'
    if(Test-Path -LiteralPath $ledgerDir){$item=Get-Item -LiteralPath $ledgerDir -Force;Assert-C2 ($item.PSIsContainer -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) 'reuse'}
    else{[IO.Directory]::CreateDirectory($ledgerDir)|Out-Null}
    Test-C2Acl $ledgerDir $allowed $forbidden
    $ledger=Join-Path $ledgerDir ([IO.Path]::GetFileName($root)+'.json');Assert-C2 (!(Test-Path -LiteralPath $ledger)) 'reuse'
    $record='{"version":1,"releaseId":"'+[IO.Path]::GetFileName($root)+'","executionId":"'+$RunId+'","manifestSha256":"'+$ManifestSha256.ToUpperInvariant()+'","reservedAtUtc":"'+[datetime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ',[Globalization.CultureInfo]::InvariantCulture)+'"}'
    $stream=[IO.File]::Open($ledger,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.Encoding]::ASCII.GetBytes($record);$stream.Write($bytes,0,$bytes.Length);$stream.Flush()}finally{$stream.Dispose()}
    Test-C2Acl $ledger $allowed $forbidden
    [IO.Directory]::CreateDirectory($run)|Out-Null;Test-C2Acl $run $allowed $forbidden
    $claim=[IO.File]::Open((Join-Path $run 'launcher-attempt.started'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$claim.Dispose()
    $temporary=Join-Path $run 'temp';[IO.Directory]::CreateDirectory($temporary)|Out-Null;Test-C2Acl $temporary $allowed $forbidden
    $resultPath=Join-Path $run 'result.json'
    Write-Host 'Introduzca la contrasena de integracion (entrada oculta, Enter para confirmar, Esc para cancelar):'
    $frame=Read-C2HiddenCredential $KeySource
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$node;$info.Arguments='"'+$entrypoint+'" --run-id '+$RunId+' --result "'+$resultPath+'" --manifest-sha256 '+$ManifestSha256.ToUpperInvariant()
    $info.WorkingDirectory=$package;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.EnvironmentVariables.Clear()
    $windows=[Environment]::GetFolderPath('Windows')
    $info.EnvironmentVariables['SystemRoot']=$windows;$info.EnvironmentVariables['WINDIR']=$windows
    $info.EnvironmentVariables['SystemDrive']=[IO.Path]::GetPathRoot($node).TrimEnd('\')
    $info.EnvironmentVariables['LOCALAPPDATA']=[Environment]::GetFolderPath('LocalApplicationData')
    $info.EnvironmentVariables['PATH']=(Join-Path $windows 'System32')
    $info.EnvironmentVariables['TEMP']=$temporary;$info.EnvironmentVariables['TMP']=$temporary
    $info.EnvironmentVariables['NODE_ENV']='test'
    $child=New-Object Diagnostics.Process;$child.StartInfo=$info;Assert-C2 ($child.Start()) 'child'
    $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
    $stream=$child.StandardInput.BaseStream;$stream.Write($frame,0,$frame.Length);$stream.Flush();$stream.Close()
    [Array]::Clear($frame,0,$frame.Length)
    if(!$child.WaitForExit(120000)){$child.Kill();$child.WaitForExit(5000)|Out-Null;throw 'C2_RECEIVER_REJECTED:timeout'}
    Assert-C2 ($stdout.Result.Length -eq 0 -and $stderr.Result.Length -eq 0) 'child'
    $result=Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert-C2 ($result.runId -ceq $RunId -and $result.mode -ceq 'c2-remote-once') 'result'
    Assert-C2 ($child.ExitCode -eq 0 -and $result.status -ceq 'passed') 'result'
    Assert-C2 (@(Get-C2Files $package $allowed $forbidden).Count -eq $expected.Count) 'inventory'
    return [pscustomobject]@{Status='passed';Code=[string]$result.code}
  }finally{
    if($frame){[Array]::Clear($frame,0,$frame.Length)}
    if($child){try{if(!$child.HasExited){$child.Kill();$child.WaitForExit(5000)|Out-Null}}catch{};$child.Dispose()}
    foreach($handle in $heldFiles){$handle.Dispose()}
  }
}

# Dot-sourcing (tests) only defines the functions.
if($MyInvocation.InvocationName -ne '.'){
  try{
    $release=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
    $outcome=Invoke-C2Receiver -Root $release -ManifestSha256 $ManifestSha256 -RunId $RunId
    Write-Output 'Receptor C.2 finalizado. Revise el resultado sanitizado en runs.'
  }catch{
    Write-Output 'Receptor C.2 rechazado. No se muestran detalles ni entradas.'
    exit 1
  }
}
