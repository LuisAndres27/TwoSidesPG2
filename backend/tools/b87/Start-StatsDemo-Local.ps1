# B87 - opens the local Express and the automatic publisher in TWO windows; each one asks for its own hidden prompts. ASCII only.
# FOR THE OWNER ONLY, after authorizing Atlas. Claude Code must NOT run this script. Nothing secret passes through this launcher: it only starts the two scripts.
#   .\tools\b87\Start-StatsDemo-Local.ps1 -AtlasHost <cluster>.<id>.mongodb.net [-IntervalMinutes 2] [-KitDir C:\TwoSidesStatsKit\hand-over] [-Port 4187]
# Close each window with Ctrl+C (the Express removes kit.json; the publisher finishes its cycle first). Then start the game from the dedicated account.
[CmdletBinding(PositionalBinding=$false)]
param(
  [Parameter(Mandatory=$true)][string]$AtlasHost,
  [ValidateRange(1,1440)][double]$IntervalMinutes=2,
  [string]$KitDir='C:\TwoSidesStatsKit\hand-over',
  [ValidateRange(1024,65535)][int]$Port=4187
)
$ErrorActionPreference='Stop'
$express=Join-Path $PSScriptRoot 'Run-Atlas-Express.ps1'
$publish=Join-Path $PSScriptRoot 'Run-Atlas-AutoPublish.ps1'
foreach($f in @($express,$publish)){ if(-not (Test-Path $f)){ throw "Missing $f" } }
$interval=[string]::Format([Globalization.CultureInfo]::InvariantCulture,'{0}',$IntervalMinutes)
Start-Process powershell.exe -ArgumentList @('-NoProfile','-NoExit','-File',"`"$express`"",'-AtlasHost',$AtlasHost,'-KitDir',"`"$KitDir`"",'-Port',"$Port")
Start-Process powershell.exe -ArgumentList @('-NoProfile','-NoExit','-File',"`"$publish`"",'-AtlasHost',$AtlasHost,'-IntervalMinutes',$interval)
Write-Host 'Two windows opened: Express (ingest) and the automatic publisher. Answer each prompt there.'
