# Read-only comparison from a normal Windows terminal; no credentials are displayed.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Path (Join-Path $root '.local') -Force | Out-Null
Push-Location (Join-Path $root 'backend')
try { & node --env-file=.env scripts/diagnose-database.js; $result=$LASTEXITCODE } finally {Pop-Location}
exit $result
