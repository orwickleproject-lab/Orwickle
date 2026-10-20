# Use the account-management token saved for this Windows user without placing it
# in shell history, command arguments, the backend environment, or this repository.
$ErrorActionPreference = 'Stop'
$supabaseArguments = @($args)
$savedTokenPath = Join-Path $env:LOCALAPPDATA 'Orwickle\secrets\supabase-token.dpapi'
$previousToken = $env:SUPABASE_ACCESS_TOKEN
$exitCode = 1
try {
    if (-not (Test-Path -LiteralPath $savedTokenPath)) {
        throw 'Saved credential not found'
    }
    $secureToken = ConvertTo-SecureString ([IO.File]::ReadAllText($savedTokenPath))
    $env:SUPABASE_ACCESS_TOKEN = (New-Object Net.NetworkCredential('', $secureToken)).Password
    $ErrorActionPreference = 'Continue'
    & npx.cmd --yes supabase --agent no @supabaseArguments
    $exitCode = $LASTEXITCODE
} catch {
    Write-Error 'Could not load or use the saved Supabase credential for this Windows user.' -ErrorAction Continue
} finally {
    $env:SUPABASE_ACCESS_TOKEN = $previousToken
    $secureToken = $null
}
exit $exitCode
