param(
  [switch]$AuthorizedForB054C2F1C2A,
  [string]$PrivateDirectory,
  [string]$ReceiverSha256,
  [string]$ManifestSha256
)
# Manual schema-only launcher. No ACL/owner access, no credential files or remote retries.
$ErrorActionPreference='Stop'
$process=$null;$secure=$null;$ptr=[IntPtr]::Zero;$bytes=$null;$plain=$null
try {
  if(!$AuthorizedForB054C2F1C2A -or $ReceiverSha256 -notmatch '^[A-Fa-f0-9]{64}$' -or $ManifestSha256 -notmatch '^[A-Fa-f0-9]{64}$'){throw 'Not authorized'}
  $base=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'TwoSides\AtlasIntegrationTests')).TrimEnd('\')
  $dir=[IO.Path]::GetFullPath($PrivateDirectory).TrimEnd('\')
  if([IO.Path]::GetDirectoryName($dir) -ne $base -or [IO.Path]::GetFileName($dir) -ne 'b054c2c-10ef4f6d653f4ee4a1d1b2e6591013c2' -or $dir -match '\\OneDrive[^\\]*\\'){throw 'Invalid private path'}
  foreach($name in @('schema-result.json','schema-attempt.started','schema-progress.jsonl','schema-supervisor.json')){
    if(Test-Path -LiteralPath (Join-Path $dir $name)){throw 'Consumed or unfinished attempt'}
  }
  $ancestor=$dir
  while($ancestor){$item=Get-Item -LiteralPath $ancestor -Force;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Linked ancestor'};$ancestor=[IO.Path]::GetDirectoryName($ancestor)}
  $receiver=Join-Path $dir 'atlas-revocation-schema-receiver.js'
  $manifestFile=Join-Path $dir 'schema-preflight-manifest.json'
  foreach($file in @($receiver,$manifestFile,$PSCommandPath)){
    $item=Get-Item -LiteralPath $file -Force
    if($item.PSIsContainer -or $item.DirectoryName -ne $dir -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Regular file required'}
  }
  if((Get-FileHash -LiteralPath $receiver -Algorithm SHA256).Hash -ine $ReceiverSha256 -or
    (Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash -ine $ManifestSha256){throw 'Integrity mismatch'}
  $manifest=Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if($manifest.Phase -ne 'B05.4C.2F.1C.2A' -or $manifest.RunId -ne '10ef4f6d653f4ee4a1d1b2e6591013c2' -or $manifest.SchemaOnly -ne $true -or
    $manifest.RacesAllowed -ne $false -or $manifest.AclAccessAllowed -ne $false -or $manifest.ReceiverSha256 -ine $ReceiverSha256 -or
    $manifest.SenderSha256 -ine (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash){throw 'Manifest mismatch'}
  $node=(Get-Command node -CommandType Application).Source
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$node;$info.Arguments='"'+$receiver+'"';$info.WorkingDirectory=$dir
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.EnvironmentVariables.Clear();$info.EnvironmentVariables['SystemRoot']=$env:SystemRoot
  $info.EnvironmentVariables['LOCALAPPDATA']=$env:LOCALAPPDATA;$info.EnvironmentVariables['NODE_ENV']='test'
  $secure=Read-Host 'Credencial temporal Atlas (entrada oculta)' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);$plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $bytes=[Text.Encoding]::UTF8.GetBytes($plain)
  if($bytes.Length -lt 1 -or $bytes.Length -gt 1024 -or $plain -match "[\r\n\x00]"){throw 'Invalid frame'}
  $process=New-Object Diagnostics.Process;$process.StartInfo=$info;if(!$process.Start()){throw 'Receiver unavailable'}
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  $length=[BitConverter]::GetBytes([uint32]$bytes.Length);if([BitConverter]::IsLittleEndian){[Array]::Reverse($length)}
  $process.StandardInput.BaseStream.Write($length,0,4);$process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length);$process.StandardInput.Close()
  if(!$process.WaitForExit(120000)){
    $process.Kill();$process.WaitForExit(5000)|Out-Null
    $notice=Join-Path $dir 'schema-supervisor.json'
    $stream=[IO.File]::Open($notice,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$noticeBytes=[Text.Encoding]::UTF8.GetBytes('{"phase":"B05.4C.2F.1C.2A","status":"unknown","supervisorTimeout":true,"preserveStructures":true}');$stream.Write($noticeBytes,0,$noticeBytes.Length)}finally{$stream.Dispose()}
    throw 'Receiver timeout'
  }
  if($process.ExitCode -ne 0 -or $stdout.Result.Length -ne 0 -or $stderr.Result.Length -ne 0){throw 'Receiver failed'}
  Write-Output 'Canal temporal finalizado; consultar resultado sanitizado. No repetir el comando.'
}catch{throw 'Canal no completado. No se muestran detalles ni credenciales. No repetir.'}
finally {
  if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
  if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  $plain=$null;if($secure){$secure.Dispose()}
  if($process){try{if(!$process.HasExited){$process.Kill();$process.WaitForExit(5000)|Out-Null}}catch{};$process.Dispose()}
}
