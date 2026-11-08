param([switch]$Restore)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$approvedRoot = 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence'
if ($projectRoot -cne $approvedRoot) { throw 'Unexpected isolated project root.' }
foreach ($entry in @((Get-Item -LiteralPath $projectRoot),(Get-Item -LiteralPath (Split-Path -Parent $projectRoot)))) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked project root.' }
}
$work = Join-Path $projectRoot '.work'
if (Test-Path -LiteralPath $work) {
    if ((Get-Item -LiteralPath $work -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked work root.' }
} else { New-Item -ItemType Directory -Path $work -Force | Out-Null }
foreach ($name in @('dotnet-home','packages','http-cache','plugins-cache','scratch','temp','databases')) {
    $path = Join-Path $work $name
    if (Test-Path -LiteralPath $path) {
        if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked work path.' }
    } else { New-Item -ItemType Directory -Path $path -Force | Out-Null }
}
if ((Get-Item -LiteralPath $work -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked work root.' }
$env:DOTNET_CLI_HOME=Join-Path $work 'dotnet-home'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_NOLOGO='1'
$env:DOTNET_ADD_GLOBAL_TOOLS_TO_PATH='0'
$env:DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE='true'
$env:MSBUILDDISABLENODEREUSE='1'
$env:NUGET_PACKAGES=Join-Path $work 'packages'
$env:NUGET_HTTP_CACHE_PATH=Join-Path $work 'http-cache'
$env:NUGET_PLUGINS_CACHE_PATH=Join-Path $work 'plugins-cache'
$env:NUGET_SCRATCH=Join-Path $work 'scratch'
$env:TEMP=Join-Path $work 'temp'
$env:TMP=$env:TEMP
$testProject=Join-Path $projectRoot 'tests\TwoSides.LocalPersistence.Checks.csproj'
Push-Location $projectRoot
try {
    if ($Restore) {
        $restoreArguments=@('restore',$testProject,'--configfile',(Join-Path $projectRoot 'NuGet.Config'),'--packages',$env:NUGET_PACKAGES,'--disable-parallel')
        if ((Test-Path -LiteralPath (Join-Path $projectRoot 'src\packages.lock.json')) -and (Test-Path -LiteralPath (Join-Path $projectRoot 'tests\packages.lock.json'))) { $restoreArguments+='--locked-mode' }
        dotnet @restoreArguments
        if ($LASTEXITCODE -ne 0) { throw 'Isolated restore failed.' }
        return
    }
    dotnet build $testProject --no-restore --disable-build-servers -nodeReuse:false
    if ($LASTEXITCODE -ne 0) { throw 'Isolated build failed.' }
    $executable=Join-Path $work 'bin\TwoSides.LocalPersistence.Checks\Debug\net8.0\win-x64\TwoSides.LocalPersistence.Checks.exe'
    & $executable $projectRoot
    if ($LASTEXITCODE -ne 0) { throw 'SQLite checks failed.' }
} finally { Pop-Location }
