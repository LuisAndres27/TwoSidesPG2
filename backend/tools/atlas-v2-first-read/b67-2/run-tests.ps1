# B67.2 synthetic test battery for offline-selftest.ps1. Disposable fixtures only; the deployed B67 / B67.1 directories are read, never written.
# Fixtures live beside the real deployments (the selftest enforces that location) and are removed file by file afterwards.
param([string]$Only='')
$ErrorActionPreference='Stop'
$here=$PSScriptRoot
$local=[Environment]::GetFolderPath('LocalApplicationData');$base=Join-Path $local 'TwoSides\AtlasV2FirstRead'
$old=Join-Path $base 'aeec6c0d34394a65817de04755d88535'          # B67 deployment (read only)
$realReceiver=Join-Path (Split-Path $here -Parent) 'b67\offline-receiver.mjs'
$selftestSrc=Join-Path $here 'offline-selftest.ps1'
$me=[Security.Principal.WindowsIdentity]::GetCurrent().User;$allowed=@($me.Value,'S-1-5-18','S-1-5-32-544')
$results=New-Object System.Collections.ArrayList
$allOutput=New-Object System.Text.StringBuilder
$fixtures=New-Object System.Collections.ArrayList
$names=@('gate.mjs','probe.mjs','receiver.mjs','send-first-read.ps1','offline-receiver.mjs','offline-selftest.ps1','v5-reference.json')
$stubTemplate=@'
const a=process.argv.slice(2),M='__MODE__';
if(a[0]==='--preflight'){if(M==='preflight-reject'){process.stdout.write('{"ok":false}\n');process.exitCode=1;}else process.stdout.write('{"ok":true}\n');}
else if(M==='recv-reject'){process.stdout.write('{"ok":false,"code":"b67_offline_rejected"}\n');process.exitCode=1;}
else if(M==='recv-exit'){process.exit(3);}
else if(M==='recv-garbage'){process.stdout.write('garbage\n');}
else if(M==='recv-contract'){process.stdout.write('{"ok":true,"exact":false,"argvLeak":false,"envLeak":false,"networkAttempts":0,"remoteEnabled":false}\n');}
else if(M==='recv-hang'){setTimeout(()=>{},120000);}
else if(M==='transport'){process.exit(0);}
'@
function New-Fixture([string]$Receiver='real',[string]$Variant='normal',[scriptblock]$Mutate=$null){
 $id=[Guid]::NewGuid().ToString('N');$dir=Join-Path $base $id
 $s=New-Object Security.AccessControl.DirectorySecurity;$s.SetOwner($me);$s.SetAccessRuleProtection($true,$false)
 foreach($sid in $allowed){$s.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow')))}
 [void][IO.Directory]::CreateDirectory($dir,$s)
 $oldSeal=Get-Content -LiteralPath (Join-Path $old 'deployment.json') -Raw | ConvertFrom-Json
 foreach($n in 'gate.mjs','probe.mjs','receiver.mjs','send-first-read.ps1','v5-reference.json'){[IO.File]::Copy((Join-Path $old $n),(Join-Path $dir $n),$false)}
 if($Receiver -eq 'real'){[IO.File]::Copy($realReceiver,(Join-Path $dir 'offline-receiver.mjs'),$false)}
 else{[IO.File]::WriteAllText((Join-Path $dir 'offline-receiver.mjs'),$stubTemplate.Replace('__MODE__',$Receiver),(New-Object Text.UTF8Encoding($false)))}
 $text=[IO.File]::ReadAllText($selftestSrc)
 if($Variant -eq 'close-stdin-before-write'){
  $marker='try{$child.StandardInput.BaseStream.Write(';if(($text.Split(@($marker),[StringSplitOptions]::None).Count-1) -ne 1){throw 'variant marker'}
  $text=$text.Replace($marker,'$child.StandardInput.Close();'+$marker)}
 [IO.File]::WriteAllText((Join-Path $dir 'offline-selftest.ps1'),$text,(New-Object Text.UTF8Encoding($false)))
 $files=[ordered]@{};foreach($n in $names){$files[$n]=(Get-FileHash -LiteralPath (Join-Path $dir $n) -Algorithm SHA256).Hash.ToLowerInvariant()}
 $d=[ordered]@{kind='two-sides-b67-offline-only';runId=$id;remoteEnabled=$false;revision='B67.2-test';backendRoot=$oldSeal.backendRoot;createdAt=[DateTime]::UtcNow.ToString('o');nodePath=$oldSeal.nodePath;nodeSha256=$oldSeal.nodeSha256;files=$files}
 if($Mutate){& $Mutate $d}
 $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($d|ConvertTo-Json -Depth 6 -Compress));[IO.File]::WriteAllBytes((Join-Path $dir 'deployment.json'),$bytes)
 $f=[pscustomobject]@{Id=$id;Dir=$dir;Sha=(Get-FileHash -LiteralPath (Join-Path $dir 'deployment.json') -Algorithm SHA256).Hash.ToLowerInvariant()}
 [void]$fixtures.Add($f);return $f
}
function Remove-Fixture($f){
 if($f.Id -notmatch '^[a-f0-9]{32}$' -or (Split-Path $f.Dir -Parent) -ine $base){throw 'unsafe fixture path'}
 if(Test-Path -LiteralPath $f.Dir){Get-ChildItem -LiteralPath $f.Dir -Force | ForEach-Object { if($_.PSIsContainer){throw 'unexpected directory in fixture'};Remove-Item -LiteralPath $_.FullName -Force };Remove-Item -LiteralPath $f.Dir -Force}
}
function Residual($f){ @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like ('*'+$f.Id+'*') -and $_.ProcessId -ne $PID }) }
function Run-Auto($f,[string]$mode,[string]$sha){
 if(-not $sha){$sha=$f.Sha}
 $i=New-Object Diagnostics.ProcessStartInfo;$i.FileName='powershell.exe';$i.UseShellExecute=$false;$i.CreateNoWindow=$true;$i.RedirectStandardOutput=$true;$i.RedirectStandardError=$true
 $i.Arguments='-NoProfile -File "'+(Join-Path $f.Dir 'offline-selftest.ps1')+'" -Mode '+$mode+' -DeploymentSha256 '+$sha+' -Automation'
 $p=[Diagnostics.Process]::Start($i);$o=$p.StandardOutput.ReadToEndAsync();$e=$p.StandardError.ReadToEndAsync()
 if(!$p.WaitForExit(200000)){$p.Kill()};[void]$p.WaitForExit(5000)
 [pscustomobject]@{Out=$o.Result;Err=$e.Result;Exit=$p.ExitCode}
}
function Run-Console($f,[string]$mode,[string]$text,[bool]$enter=$true){
 $out=Join-Path $env:TEMP ('b67-1-'+$f.Id+'.txt')
 $line='/c powershell.exe -NoProfile -File "'+(Join-Path $f.Dir 'offline-selftest.ps1')+'" -Mode '+$mode+' -DeploymentSha256 '+$f.Sha+' > "'+$out+'" 2>&1'
 $t=Start-Process cmd.exe -ArgumentList $line -WindowStyle Minimized -PassThru
 $inj=@('-NoProfile','-File',(Join-Path $here 'console-inject.ps1'),'-Id',$f.Id,'-Spec',('t:'+$text),'-OutFile',$out);if(-not $enter){$inj+='-NoEnter'}
 $r=& powershell.exe @inj
 if(!$t.WaitForExit(200000)){ Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like ('*'+$f.Id+'*') -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue } }
 $o='';if(Test-Path -LiteralPath $out){$o=[IO.File]::ReadAllText($out);Remove-Item -LiteralPath $out -Force}
 [pscustomobject]@{Out=$o;Err=($r -join ' ');Exit=$t.ExitCode}
}
$lineOk='^(SYNTHETIC ONLY: type B67-ONLY-FAKE-2026! at the hidden prompt\. Never use a real password\.|SYNTHETIC CANCEL: press Enter without typing anything\. Never use a real password\.|B67 synthetic input \(hidden\): ?|B67_STAGE=(integrity|preflight|compare|receiver|cleanup) ok|B67_STAGE=input (waiting|received)|B67_SELFTEST=PASS mode=(Accept|Cancel|Check) syntheticOnly=True cleanup=True|B67_SELFTEST=FAIL mode=(Accept|Cancel|Check) stage=(integrity|preflight|input|compare|receiver|cleanup) code=[A-Z_]+ cleanup=(ok|failed))$'
function Check([string]$name,$run,[string]$expectLine,[string[]]$forbid=@(),[string[]]$mustLack=@()){
 $okFlag=$true;$why=@()
 $lines=@($run.Out -split "`r?`n" | Where-Object { $_.Trim() -ne '' })
 $result=@($lines | Where-Object { $_ -like 'B67_SELFTEST=*' })
 if($result.Count -ne 1 -or $result[0] -cne $expectLine){$okFlag=$false;$why+='result-line: '+($result -join ' | ')}
 foreach($l in $lines){ if($l -cnotmatch $lineOk){$okFlag=$false;$why+='unlisted-output-line'} }
 if($run.Err -and $run.Err.Trim() -ne '' -and $run.Err -ne 'injected'){$okFlag=$false;$why+='stderr/injector: '+$run.Err.Trim().Substring(0,[Math]::Min(60,$run.Err.Trim().Length))}
 foreach($m in $forbid){ if($run.Out.Contains($m)){$okFlag=$false;$why+='forbidden-text'} }
 foreach($m in $mustLack){ if($run.Out.Contains($m)){$okFlag=$false;$why+='unexpected-stage: '+$m} }
 $expectExit=0;if($expectLine -like '*FAIL*'){$expectExit=1}
 if($run.Exit -ne $expectExit){$okFlag=$false;$why+='exit='+$run.Exit}
 [void]$allOutput.AppendLine($run.Out)
 [void]$results.Add([pscustomobject]@{Case=$name;Pass=$okFlag;Why=($why -join '; ')})
 Write-Host (('{0,-4} {1}' -f $(if($okFlag){'PASS'}else{'FAIL'}),$name)+$(if(!$okFlag){'  <'+($why -join '; ')+'>'}))
}
function Case([string]$name,[scriptblock]$body){
 if($Only -and $name -notlike ('*'+$Only+'*')){return}
 $f=$null
 try{ & $body ([ref]$f) }catch{ [void]$results.Add([pscustomobject]@{Case=$name;Pass=$false;Why='harness exception: '+$_.Exception.Message});Write-Host ('FAIL '+$name+' <harness exception>') }
 finally{ foreach($x in @($fixtures)){ $res=Residual $x; if($res.Count){ [void]$results.Add([pscustomobject]@{Case=$name+' [residual processes]';Pass=$false;Why=[string]$res.Count}); $res | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }; Write-Host ('FAIL '+$name+' residual processes: '+$res.Count) }
   try{Remove-Fixture $x}catch{[void]$results.Add([pscustomobject]@{Case=$name+' [fixture removal]';Pass=$false;Why='not removed'})}; if(Test-Path -LiteralPath $x.Dir){[void]$results.Add([pscustomobject]@{Case=$name+' [fixture still present]';Pass=$false;Why=''})} }
   $fixtures.Clear() }
}
$S='B67-ONLY-FAKE-2026!'
# ---- Automation cases (no console) ----
Case 'A01 Accept valid (Automation)' { param($r) $f=New-Fixture; Check 'A01 Accept valid (Automation)' (Run-Auto $f 'Accept') 'B67_SELFTEST=PASS mode=Accept syntheticOnly=True cleanup=True' }
Case 'A02 Cancel valid (Automation)' { param($r) $f=New-Fixture; Check 'A02 Cancel valid (Automation)' (Run-Auto $f 'Cancel') 'B67_SELFTEST=PASS mode=Cancel syntheticOnly=True cleanup=True' -mustLack @('B67_STAGE=receiver') }
Case 'A03 integrity: altered file' { param($r) $f=New-Fixture; Add-Content -LiteralPath (Join-Path $f.Dir 'probe.mjs') -Value '// altered copy'; Check 'A03 integrity: altered file' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_FILE_HASH cleanup=ok' -mustLack @('B67_STAGE=input') }
Case 'A04 integrity: wrong seal digest' { param($r) $f=New-Fixture; Check 'A04 integrity: wrong seal digest' (Run-Auto $f 'Accept' ('0'*64)) 'B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_SEAL_ARG cleanup=ok' }
Case 'A05 integrity: missing file' { param($r) $f=New-Fixture; Remove-Item -LiteralPath (Join-Path $f.Dir 'gate.mjs') -Force; Check 'A05 integrity: missing file' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_FILE_MISSING cleanup=ok' }
Case 'A06 preflight rejected' { param($r) $f=New-Fixture 'preflight-reject'; Check 'A06 preflight rejected' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=preflight code=PREFLIGHT_REJECTED cleanup=ok' -mustLack @('B67_STAGE=input') }
Case 'A07 receiver rejected' { param($r) $f=New-Fixture 'recv-reject'; Check 'A07 receiver rejected' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=receiver code=RECEIVER_REJECTED cleanup=ok' }
Case 'A08 receiver exit code' { param($r) $f=New-Fixture 'recv-exit'; Check 'A08 receiver exit code' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=receiver code=RECEIVER_EXIT cleanup=ok' }
Case 'A09 receiver garbage output' { param($r) $f=New-Fixture 'recv-garbage'; Check 'A09 receiver garbage output' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=receiver code=RECEIVER_CONTRACT cleanup=ok' }
Case 'A10 receiver contract violation' { param($r) $f=New-Fixture 'recv-contract'; Check 'A10 receiver contract violation' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=receiver code=RECEIVER_CONTRACT cleanup=ok' }
Case 'A11 transport (write fails, stdin closed in copy)' { param($r) $f=New-Fixture 'transport' 'close-stdin-before-write'; Check 'A11 transport (write fails, stdin closed in copy)' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=receiver code=TRANSPORT_WRITE cleanup=ok' }
Case 'A12 receiver timeout (60 s)' { param($r) $f=New-Fixture 'recv-hang'; Check 'A12 receiver timeout (60 s)' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=receiver code=RECEIVER_TIMEOUT cleanup=ok' }
# ---- B67.2: seal digest argument handling and Check mode ----
Case 'S01 uppercase digest accepted' { param($r) $f=New-Fixture; Check 'S01 uppercase digest accepted' (Run-Auto $f 'Accept' $f.Sha.ToUpperInvariant()) 'B67_SELFTEST=PASS mode=Accept syntheticOnly=True cleanup=True' }
Case 'S02 mixed-case digest accepted' { param($r) $f=New-Fixture; $m=$f.Sha.Substring(0,32).ToUpperInvariant()+$f.Sha.Substring(32); Check 'S02 mixed-case digest accepted' (Run-Auto $f 'Accept' $m) 'B67_SELFTEST=PASS mode=Accept syntheticOnly=True cleanup=True' }
Case 'S03 other file hash as digest rejected' { param($r) $f=New-Fixture; $h=(Get-FileHash -LiteralPath (Join-Path $f.Dir 'offline-selftest.ps1') -Algorithm SHA256).Hash; Check 'S03 other file hash as digest rejected' (Run-Auto $f 'Accept' $h) 'B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_SEAL_ARG cleanup=ok' -mustLack @('B67_STAGE=preflight') }
Case 'S04 one-nibble-off digest rejected' { param($r) $f=New-Fixture; $c=$f.Sha.Substring(0,63)+$(if($f.Sha[63] -eq '0'){'1'}else{'0'}); Check 'S04 one-nibble-off digest rejected' (Run-Auto $f 'Accept' $c) 'B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_SEAL_ARG cleanup=ok' }
Case 'S05 seal remoteEnabled=true (resealed)' { param($r) $f=New-Fixture 'real' 'normal' { param($d) $d.remoteEnabled=$true }; Check 'S05 seal remoteEnabled=true (resealed)' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_SEAL cleanup=ok' }
Case 'S06 seal with extra file entry (resealed)' { param($r) $f=New-Fixture 'real' 'normal' { param($d) $d.files['extra.bin']=('0'*64) }; Check 'S06 seal with extra file entry (resealed)' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_SEAL cleanup=ok' }
Case 'S07 seal runId mismatch (resealed)' { param($r) $f=New-Fixture 'real' 'normal' { param($d) $d.runId=('0'*32) }; Check 'S07 seal runId mismatch (resealed)' (Run-Auto $f 'Accept') 'B67_SELFTEST=FAIL mode=Accept stage=integrity code=INTEGRITY_SEAL cleanup=ok' }
Case 'K01 Check valid (no input, no receiver data)' { param($r) $f=New-Fixture; Check 'K01 Check valid (no input, no receiver data)' (Run-Auto $f 'Check') 'B67_SELFTEST=PASS mode=Check syntheticOnly=True cleanup=True' -mustLack @('B67_STAGE=input','B67_STAGE=compare','B67_STAGE=receiver') }
Case 'K02 Check with altered file' { param($r) $f=New-Fixture; Add-Content -LiteralPath (Join-Path $f.Dir 'probe.mjs') -Value '// altered copy'; Check 'K02 Check with altered file' (Run-Auto $f 'Check') 'B67_SELFTEST=FAIL mode=Check stage=integrity code=INTEGRITY_FILE_HASH cleanup=ok' }
Case 'K03 Check with preflight rejected' { param($r) $f=New-Fixture 'preflight-reject'; Check 'K03 Check with preflight rejected' (Run-Auto $f 'Check') 'B67_SELFTEST=FAIL mode=Check stage=preflight code=PREFLIGHT_REJECTED cleanup=ok' }
# ---- Real hidden console, synthetic keystrokes ----
Case 'C01 console Accept valid' { param($r) $f=New-Fixture; Check 'C01 console Accept valid' (Run-Console $f 'Accept' $S) 'B67_SELFTEST=PASS mode=Accept syntheticOnly=True cleanup=True' }
Case 'C02 console Accept wrong input' { param($r) $f=New-Fixture; Check 'C02 console Accept wrong input' (Run-Console $f 'Accept' 'FAKE-REJECT-B67-NOT-A-CREDENTIAL') 'B67_SELFTEST=FAIL mode=Accept stage=compare code=INPUT_MISMATCH cleanup=ok' -forbid @('FAKE-REJECT') -mustLack @('B67_STAGE=receiver') }
Case 'C03 console Accept empty input' { param($r) $f=New-Fixture; Check 'C03 console Accept empty input' (Run-Console $f 'Accept' '') 'B67_SELFTEST=FAIL mode=Accept stage=compare code=INPUT_EMPTY cleanup=ok' -mustLack @('B67_STAGE=receiver') }
Case 'C04 console Accept extra trailing space' { param($r) $f=New-Fixture; Check 'C04 console Accept extra trailing space' (Run-Console $f 'Accept' ($S+' ')) 'B67_SELFTEST=FAIL mode=Accept stage=compare code=INPUT_MISMATCH cleanup=ok' -mustLack @('B67_STAGE=receiver') }
Case 'C05 console Accept pasted command line' { param($r) $f=New-Fixture; Check 'C05 console Accept pasted command line' (Run-Console $f 'Accept' 'powershell.exe -NoProfile -File x.ps1 -Mode Cancel -DeploymentSha256 abc') 'B67_SELFTEST=FAIL mode=Accept stage=compare code=INPUT_MISMATCH cleanup=ok' -forbid @('-Mode Cancel -Deployment') }
Case 'C06 console Cancel valid (safe cancel)' { param($r) $f=New-Fixture; Check 'C06 console Cancel valid (safe cancel)' (Run-Console $f 'Cancel' '') 'B67_SELFTEST=PASS mode=Cancel syntheticOnly=True cleanup=True' -mustLack @('B67_STAGE=receiver','B67_STAGE=compare') }
Case 'C07 console Cancel with text' { param($r) $f=New-Fixture; Check 'C07 console Cancel with text' (Run-Console $f 'Cancel' 'FAKE-REJECT-B67-NOT-A-CREDENTIAL') 'B67_SELFTEST=FAIL mode=Cancel stage=compare code=CANCEL_INPUT_NOT_EMPTY cleanup=ok' -forbid @('FAKE-REJECT') -mustLack @('B67_STAGE=receiver') }
# ---- Global checks ----
$ao=$allOutput.ToString()
$leak=($ao.Contains('FAKE-REJECT'))
[void]$results.Add([pscustomobject]@{Case='G01 no rejected-input text in any output';Pass=(-not $leak);Why=''})
$leftFix=@(Get-ChildItem -LiteralPath $base -Directory -Force | Where-Object { $_.Name -ne 'aeec6c0d34394a65817de04755d88535' -and $_.CreationTime -gt (Get-Date).AddHours(-2) -and (Get-ChildItem -LiteralPath $_.FullName -Force | Where-Object { $_.Name -eq 'deployment.json' } | ForEach-Object { (Get-Content -LiteralPath $_.FullName -Raw) -match 'B67.2-test' }) })
[void]$results.Add([pscustomobject]@{Case='G02 no fixture directory left';Pass=($leftFix.Count -eq 0);Why=[string]$leftFix.Count})
$bad=@($results | Where-Object { -not $_.Pass })
Write-Host ('SUMMARY total='+$results.Count+' failed='+$bad.Count)
$bad | ForEach-Object { Write-Host ('  FAILED: '+$_.Case+' '+$_.Why) }
if($bad.Count){exit 1}else{exit 0}
