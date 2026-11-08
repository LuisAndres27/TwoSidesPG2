param([switch]$Restore)
$ErrorActionPreference = 'Stop'
# Builds the HTTP client library and runs its checks against the real Express 'offline-test' composition (loopback) with disposable SQLite only.
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$approvedRoot = 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA\local-persistence'
if ($projectRoot -cne $approvedRoot) { throw 'Unexpected isolated project root.' }
$work = Join-Path $projectRoot '.work'
foreach ($name in @('dotnet-home','packages','http-cache','plugins-cache','scratch','temp','databases')) { New-Item -ItemType Directory -Path (Join-Path $work $name) -Force | Out-Null }
$env:DOTNET_CLI_HOME=Join-Path $work 'dotnet-home'; $env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'; $env:DOTNET_CLI_TELEMETRY_OPTOUT='1'; $env:DOTNET_NOLOGO='1'
$env:DOTNET_ADD_GLOBAL_TOOLS_TO_PATH='0'; $env:DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE='true'; $env:MSBUILDDISABLENODEREUSE='1'
$env:NUGET_PACKAGES=Join-Path $work 'packages'; $env:NUGET_HTTP_CACHE_PATH=Join-Path $work 'http-cache'
$env:NUGET_PLUGINS_CACHE_PATH=Join-Path $work 'plugins-cache'; $env:NUGET_SCRATCH=Join-Path $work 'scratch'
$env:TEMP=Join-Path $work 'temp'; $env:TMP=$env:TEMP
$checks = Join-Path $projectRoot 'sync-http-tests\SyncHttp.Checks.csproj'
Push-Location $projectRoot
try {
    if ($Restore) {
        dotnet restore $checks --configfile (Join-Path $projectRoot 'NuGet.Config') --packages $env:NUGET_PACKAGES --disable-parallel
        if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }
        return
    }
    dotnet build $checks --no-restore --disable-build-servers -nodeReuse:false
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    & (Join-Path $work 'bin\SyncHttp.Checks\Debug\net8.0\win-x64\SyncHttp.Checks.exe')
    if ($LASTEXITCODE -ne 0) { throw 'Sync HTTP checks failed.' }
} finally { Pop-Location }
