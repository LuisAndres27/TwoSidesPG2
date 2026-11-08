param([switch]$Restore)
$ErrorActionPreference = 'Stop'
# B87: builds and runs the statistics-kit checks (gate, kit files, credential provider and the real chain SQLite -> StatisticsTransport -> Express) with disposable data only.
# Loopback only; no Atlas, no AWS, no PlayerData. Run it from anywhere; it works from the repository root because the checks locate backend/ relative to it.
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$repoRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '..'))
$work = Join-Path $projectRoot '.work'
foreach ($name in @('dotnet-home','packages','http-cache','plugins-cache','scratch','temp','databases')) { New-Item -ItemType Directory -Path (Join-Path $work $name) -Force | Out-Null }
$env:DOTNET_CLI_HOME=Join-Path $work 'dotnet-home'; $env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'; $env:DOTNET_CLI_TELEMETRY_OPTOUT='1'; $env:DOTNET_NOLOGO='1'
$env:DOTNET_ADD_GLOBAL_TOOLS_TO_PATH='0'; $env:DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE='true'; $env:MSBUILDDISABLENODEREUSE='1'
$env:NUGET_PACKAGES=Join-Path $work 'packages'; $env:NUGET_HTTP_CACHE_PATH=Join-Path $work 'http-cache'
$env:NUGET_PLUGINS_CACHE_PATH=Join-Path $work 'plugins-cache'; $env:NUGET_SCRATCH=Join-Path $work 'scratch'
$originalTemp=$env:TEMP; $originalTmp=$env:TMP   # dotnet uses the local .work/temp; the checks run with the ORIGINAL temp (the synthetic store refuses folders under OneDrive)
$env:TEMP=Join-Path $work 'temp'; $env:TMP=$env:TEMP
$checks = Join-Path $projectRoot 'statistics-kit-tests\StatisticsKit.Checks.csproj'
Push-Location $repoRoot
try {
    if ($Restore) {
        dotnet restore $checks --configfile (Join-Path $projectRoot 'NuGet.Config') --packages $env:NUGET_PACKAGES --disable-parallel --locked-mode
        if ($LASTEXITCODE -ne 0) { throw 'Restore failed.' }
        return
    }
    dotnet build $checks --no-restore --disable-build-servers -nodeReuse:false
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    $env:TEMP=$originalTemp; $env:TMP=$originalTmp
    & (Join-Path $work 'bin\StatisticsKit.Checks\Debug\net8.0\win-x64\TwoSides.StatisticsKit.Checks.exe')
    if ($LASTEXITCODE -ne 0) { throw 'Statistics kit checks failed.' }
} finally { Pop-Location }
