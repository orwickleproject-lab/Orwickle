# Stop only the background API launched by this setup, before taking over with npm run dev.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$processFile = Join-Path $projectRoot '.local/backend-process-id.txt'
if (-not (Test-Path -LiteralPath $processFile)) {
    Write-Output 'No setup backend process is recorded.'
    exit 0
}
$backendPid = [int]([IO.File]::ReadAllText($processFile).Trim())
$backendProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $backendPid"
if ($backendProcess) {
    $entryPoint = Join-Path $projectRoot 'backend\src\server.js'
    if ($backendProcess.Name -ne 'node.exe' -or
        $backendProcess.CommandLine.IndexOf($entryPoint, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw 'Recorded process is not the Orwickle setup backend; it was not stopped.'
    }
    Stop-Process -Id $backendPid
    Write-Output 'Stopped the Orwickle setup backend.'
}
Remove-Item -LiteralPath $processFile -Force
