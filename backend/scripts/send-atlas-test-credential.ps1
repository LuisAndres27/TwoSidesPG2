param(
  [switch]$AuthorizedForB054C2D,
  [string]$ReceiverPath,
  [string]$ReceiverSha256,
  [string]$PrivateDirectory
)
# MANUAL future D launcher only. Never invoked by app/server/tests or this C phase.
$ErrorActionPreference='Stop'
$process=$null;$secure=$null;$ptr=[IntPtr]::Zero;$bytes=$null;$plain=$null
try {
  if(!$AuthorizedForB054C2D -or $ReceiverSha256 -notmatch '^[0-9a-fA-F]{64}$'){throw 'Not authorized'}
  $base=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'TwoSides\AtlasIntegrationTests')).TrimEnd('\')
  $dir=[IO.Path]::GetFullPath($PrivateDirectory).TrimEnd('\')
  if([IO.Path]::GetDirectoryName($dir) -ne $base -or [IO.Path]::GetFileName($dir) -notmatch '^b054c2c-[0-9a-f]{32}$'){throw 'Invalid directory'}
  if($dir -match '\\OneDrive[^\\]*\\'){throw 'OneDrive path rejected'}
  if(Test-Path -LiteralPath (Join-Path $dir 'readonly-result.json')){throw 'Existing run result rejected before credential prompt'}
  if(Test-Path -LiteralPath (Join-Path $dir 'readonly-attempt.started')){throw 'Consumed run rejected before credential prompt'}
  $ancestor=$dir
  while($ancestor){$i=Get-Item -LiteralPath $ancestor -Force;if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Reparse ancestor rejected'};$ancestor=[IO.Path]::GetDirectoryName($ancestor)}
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  foreach($p in @($base,$dir)){
    $i=Get-Item -LiteralPath $p -Force;$a=Get-Acl -LiteralPath $p
    if(($i.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $a.Owner -ne [Security.Principal.WindowsIdentity]::GetCurrent().Name){throw 'Private directory required'}
    foreach($ace in $a.Access){if($ace.AccessControlType -eq 'Allow' -and @($sid,'S-1-5-18','S-1-5-32-544') -notcontains $ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value){throw 'Private access not established'}}
  }
  $receiver=(Get-Item -LiteralPath $ReceiverPath -Force)
  if($receiver.DirectoryName -ne $dir -or $receiver.PSIsContainer -or $receiver.Extension -ne '.js' -or ($receiver.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
    (Get-FileHash -LiteralPath $receiver.FullName -Algorithm SHA256).Hash -ine $ReceiverSha256){throw 'Reviewed receiver required'}
  $node=(Get-Command node -CommandType Application -ErrorAction Stop).Source
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$node;$info.Arguments='"'+$receiver.FullName+'"';$info.WorkingDirectory=$dir
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.EnvironmentVariables.Clear();$info.EnvironmentVariables['SystemRoot']=$env:SystemRoot
  $info.EnvironmentVariables['LOCALAPPDATA']=$env:LOCALAPPDATA;$info.EnvironmentVariables['NODE_ENV']='test'
  $secure=Read-Host 'Credencial temporal de integración Atlas (entrada oculta)' -AsSecureString
  $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $bytes=[Text.Encoding]::UTF8.GetBytes($plain)
  if($bytes.Length -lt 1 -or $bytes.Length -gt 1024 -or $plain -match "[\r\n\x00]"){throw 'Invalid credential frame'}
  $process=New-Object Diagnostics.Process;$process.StartInfo=$info
  if(!$process.Start()){throw 'Receiver unavailable'}
  $out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync()
  $length=[BitConverter]::GetBytes([uint32]$bytes.Length);if([BitConverter]::IsLittleEndian){[Array]::Reverse($length)}
  $process.StandardInput.BaseStream.Write($length,0,4)
  $process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length);$process.StandardInput.Close()
  if(!$process.WaitForExit(30000)){$process.Kill();throw 'Receiver timeout'}
  if($process.ExitCode -ne 0 -or $out.Result.Length -ne 0 -or $err.Result.Length -ne 0){throw 'Receiver failed'}
  Write-Output 'Canal temporal finalizado; esto no acredita conexión ni validación Atlas.'
}catch{throw 'Entrega temporal no completada. No se muestran detalles ni credenciales.'}
finally {
  if($bytes){[Array]::Clear($bytes,0,$bytes.Length)}
  if($ptr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
  $plain=$null;if($secure){$secure.Dispose()};if($process){try{if(!$process.HasExited){$process.Kill();$process.WaitForExit(5000)|Out-Null}}catch{};$process.Dispose()}
}
