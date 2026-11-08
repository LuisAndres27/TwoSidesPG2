param([ValidateSet('Restore','Build','Test','Progress')][string]$Mode='Build')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if($root -cne 'C:\Users\luis2\OneDrive\Desktop\PRUEBA\TWO SIDES PRUEBA\Two-Sides PRUEBA'){throw 'Unexpected copy'}
$work=Join-Path $root 'local-persistence\.work'
$checks=Join-Path $root 'local-persistence\game-save-tests\GameSave.Checks.csproj'
& (Join-Path $PSScriptRoot 'run-infrastructure.ps1') -Mode $(if($Mode -eq 'Restore'){'Restore'}else{'Build'})
if($LASTEXITCODE -ne 0){throw 'Infrastructure build/restore failed'}
if($Mode -eq 'Restore'){
    $restoreArgs=@('restore',$checks,'--configfile',(Join-Path $root 'local-persistence\NuGet.Config'),'--packages',$env:NUGET_PACKAGES,'--disable-parallel')
    if(Test-Path -LiteralPath (Join-Path $root 'local-persistence\game-save-tests\packages.lock.json')){$restoreArgs+='--locked-mode'}
    dotnet @restoreArgs
    if($LASTEXITCODE -ne 0){throw 'Basic game checks restore failed'}
}else{
    dotnet build $checks --no-restore --disable-build-servers -nodeReuse:false
    if($LASTEXITCODE -ne 0){throw 'Basic game checks build failed'}
    if($Mode -in @('Test','Progress')){
        $exe=Join-Path $work 'bin\GameSave.Checks\Debug\net8.0\win-x64\GameSave.Checks.exe'
        if($Mode -eq 'Progress'){ & $exe --progress }else{ & $exe }
        if($LASTEXITCODE -ne 0){throw 'Basic game checks failed'}
    }
}
