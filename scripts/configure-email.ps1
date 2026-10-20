# Run locally; the app password is read without echo and never passed as an argument.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$envPath = Join-Path $projectRoot 'backend\.env'
$secret = $null
$plain = $null
try {
    Write-Host 'Use a Google app password for orwickleproject@gmail.com (2-Step Verification must be enabled).'
    $secret = Read-Host 'Google app password (hidden)' -AsSecureString
    $plain = (New-Object Net.NetworkCredential('', $secret)).Password -replace '\s', ''
    if ($plain -notmatch '^[a-zA-Z0-9]{16}$') { throw 'Invalid app password format' }
    $lines = @([IO.File]::ReadAllLines($envPath) | Where-Object { $_ -notmatch '^(SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_USER|SMTP_PASSWORD|MAIL_FROM)=' })
    $lines += @('SMTP_HOST=smtp.gmail.com', 'SMTP_PORT=465', 'SMTP_SECURE=true', 'SMTP_USER=orwickleproject@gmail.com', "SMTP_PASSWORD=$plain", 'MAIL_FROM=orwickleproject@gmail.com')
    [IO.File]::WriteAllLines($envPath, $lines, (New-Object Text.UTF8Encoding($false)))
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $envPath /inheritance:r /grant:r "${identity}:(F)" | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not protect local credentials'}
    Push-Location (Join-Path $projectRoot 'backend')
    try { & node --env-file=.env scripts/verify-email.js } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'SMTP verification failed' }
    Write-Host 'Email credential saved in the ignored, user-only backend environment. SMTP verified.'
} catch {
    Write-Host 'Email setup did not verify. Check that the Google app password is active, then rerun this helper.'
    exit 1
} finally { $plain = $null; $secret = $null }
