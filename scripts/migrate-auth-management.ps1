# Optional setup path when database TCP is unavailable; runtime still uses PostgreSQL/TLS.
$ErrorActionPreference='Stop'
$previous=$env:SUPABASE_ACCESS_TOKEN
try {
 $path=Join-Path $env:LOCALAPPDATA 'Orwickle\secrets\supabase-token.dpapi'
 $secure=ConvertTo-SecureString ([IO.File]::ReadAllText($path))
 $env:SUPABASE_ACCESS_TOKEN=(New-Object Net.NetworkCredential('', $secure)).Password
 Push-Location (Join-Path (Split-Path $PSScriptRoot -Parent) 'backend')
 try {& node scripts/migrate-auth-management.js; $result=$LASTEXITCODE}finally{Pop-Location}
}catch{Write-Host 'Could not perform management migration with the saved local credential.';$result=1}
finally{$env:SUPABASE_ACCESS_TOKEN=$previous;$secure=$null}
exit $result
