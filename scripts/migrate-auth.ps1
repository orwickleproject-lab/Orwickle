$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $root 'backend')
try {
  if(-not(Test-Path -LiteralPath '.env.migrations')) { Copy-Item -LiteralPath '.env' -Destination '.env.migrations' }
  foreach($path in @('.env','.env.migrations')) {
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $path /inheritance:r /grant:r "${identity}:(F)" | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not protect local credentials'}
  }
  & node --env-file=.env.migrations scripts/migrate-auth.js
  $result=$LASTEXITCODE
}finally{Pop-Location}
exit $result
