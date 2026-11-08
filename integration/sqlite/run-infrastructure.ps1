param([ValidateSet('Restore','Build','Test')][string]$Mode = 'Build')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if($root -cne 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA'){throw 'Unexpected copy'}
foreach($p in @($root,(Join-Path $root 'local-persistence'),$PSScriptRoot)){
    if((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked project'}
}
$work=Join-Path $root 'local-persistence\.work'
foreach($p in @($work,(Join-Path $PSScriptRoot '.work'))){
    if(Test-Path -LiteralPath $p){if((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked work'}}
    else{New-Item -ItemType Directory -Path $p | Out-Null}
}
foreach($name in @('dotnet-home','packages','http-cache','plugins-cache','scratch','temp')){
    $p=Join-Path $work $name
    if(Test-Path -LiteralPath $p){if((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked cache'}}
    else{New-Item -ItemType Directory -Path $p | Out-Null}
}
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
$env:TEMP=Join-Path $work 'temp'; $env:TMP=$env:TEMP
$config=Join-Path $root 'local-persistence\NuGet.Config'
$game=Join-Path $root 'TwoSides.csproj'
$checks=Join-Path $root 'local-persistence\infrastructure-tests\Infrastructure.Checks.csproj'
Push-Location $root
try{
    if($Mode -eq 'Restore'){
        dotnet restore $checks --configfile $config --packages $env:NUGET_PACKAGES --disable-parallel
        if($LASTEXITCODE -ne 0){throw 'Infrastructure restore failed'}
        dotnet restore $game --configfile $config --packages $env:NUGET_PACKAGES --disable-parallel -p:TwoSidesIsolatedBuild=true
        if($LASTEXITCODE -ne 0){throw 'Godot project restore failed'}
    } elseif($Mode -eq 'Build'){
        dotnet build $checks --no-restore --disable-build-servers -nodeReuse:false
        if($LASTEXITCODE -ne 0){throw 'Infrastructure build failed'}
        dotnet build $game --no-restore --disable-build-servers -nodeReuse:false -p:TwoSidesIsolatedBuild=true
        if($LASTEXITCODE -ne 0){throw 'Godot C# build failed'}
    } else {
        $exe=Join-Path $work 'bin\Infrastructure.Checks\Debug\net8.0\win-x64\Infrastructure.Checks.exe'
        & $exe
        if($LASTEXITCODE -ne 0){throw 'Infrastructure checks failed'}
    }
}finally{Pop-Location}
