param([string]$Email='orwickleproject@gmail.com', [string]$FullName='Orwickle Administrator')
$ErrorActionPreference='Stop'
$secret=$null
$plain=$null
try {
  $secret=Read-Host 'Initial administrator password (at least 12 characters, hidden)' -AsSecureString
  $plain=(New-Object Net.NetworkCredential('', $secret)).Password
  if($plain.Length -lt 12 -or $plain.Length -gt 128) {throw 'Password length'}
  $payload=@{email=$Email;fullName=$FullName;password=$plain} | ConvertTo-Json -Compress
  Push-Location (Join-Path (Split-Path $PSScriptRoot -Parent) 'backend')
  try { $payload | & node --env-file=.env.migrations scripts/provision-admin.js } finally { Pop-Location }
  if($LASTEXITCODE -ne 0){throw 'Provisioning failed'}
} catch { Write-Host 'Administrator setup did not complete. Check database access and local inputs.';exit 1 }
finally { $secret=$null;$plain=$null;$payload=$null }
