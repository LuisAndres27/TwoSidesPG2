param(
  [ValidateSet('Accept','Cancel')][string]$Mode='Accept'
)
# Interactive self-test of the hidden-input routine with a FICTITIOUS string. It is NOT the receiver: it has no run,
# no manifest, no child process, no network and writes nothing. It reuses Read-C2HiddenCredential from c2-receiver.ps1 unchanged.
# Type ONLY the fictitious text shown below. Never type a real password here: a different entry is simply reported as FAIL
# and discarded, but this script is not a place for secrets.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'c2-receiver.ps1')
$script:SelfTestText='FAKE-INTERACTIVE-TEST-0001'

function Invoke-C2HiddenInputSelfTest([string]$Mode,[scriptblock]$KeySource){
  $expected=$null;$frame=$null
  try{
    if($Mode -eq 'Cancel'){
      try{$frame=Read-C2HiddenCredential $KeySource}catch{if($_.Exception.Message -ceq 'C2_RECEIVER_REJECTED:input'){return 'HIDDEN_INPUT_SELFTEST=PASS mode=Cancel'}}
      return 'HIDDEN_INPUT_SELFTEST=FAIL mode=Cancel'
    }
    try{$frame=Read-C2HiddenCredential $KeySource}catch{return 'HIDDEN_INPUT_SELFTEST=FAIL mode=Accept'}
    $body=[Text.Encoding]::UTF8.GetBytes($script:SelfTestText)
    $expected=New-Object 'byte[]' (4+$body.Length)
    $expected[3]=[byte]$body.Length;[Array]::Copy($body,0,$expected,4,$body.Length)
    $same=($frame.Length -eq $expected.Length)
    if($same){for($i=0;$i -lt $frame.Length;$i++){if($frame[$i] -ne $expected[$i]){$same=$false}}}
    if($same){return "HIDDEN_INPUT_SELFTEST=PASS mode=Accept bytes=$($body.Length)"}
    return 'HIDDEN_INPUT_SELFTEST=FAIL mode=Accept'
  }finally{
    if($frame){[Array]::Clear($frame,0,$frame.Length)}
    if($expected){[Array]::Clear($expected,0,$expected.Length)}
  }
}

if($MyInvocation.InvocationName -ne '.'){
  if([Console]::IsInputRedirected){Write-Output 'HIDDEN_INPUT_SELFTEST=REFUSED (se requiere una consola interactiva)';exit 1}
  if($Mode -eq 'Accept'){
    Write-Host "Prueba con texto FICTICIO. Escriba exactamente: $($script:SelfTestText)"
    Write-Host 'Compruebe que NO se muestra nada al escribir. Puede probar Retroceso. Pulse Enter para terminar. No escriba ninguna contrasena real.'
  }else{
    Write-Host 'Pulse Esc para cancelar. Compruebe que NO se muestra nada al escribir algunas teclas antes. No escriba ninguna contrasena real.'
  }
  $result=Invoke-C2HiddenInputSelfTest $Mode {[Console]::ReadKey($true)}
  Write-Output $result
  if($result -notmatch '=PASS'){exit 1}
}
