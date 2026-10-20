# Process-only setting: Android builds do not need Windows desktop plugin symlinks.
$previous = $env:FLUTTER_WINDOWS
try {
  $env:FLUTTER_WINDOWS='false'
  Push-Location (Join-Path (Split-Path $PSScriptRoot -Parent) 'mobile')
  try { & flutter @args; $result=$LASTEXITCODE } finally { Pop-Location }
} finally { $env:FLUTTER_WINDOWS=$previous }
exit $result
