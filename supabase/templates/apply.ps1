# Requires PowerShell 7+. No credentials are stored in this script or its backups.
[CmdletBinding()]
param([switch]$Apply, [switch]$VerifyOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'Please use PowerShell 7 or the manual HTML copy workflow.' }
if ($Apply -and $VerifyOnly) { throw 'Choose either -Apply or -VerifyOnly.' }

$projectRef = 'cznhnupwojmydttdattb'
$endpoint = "https://api.supabase.com/v1/projects/$projectRef/config/auth"
$desired = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'auth-email-config.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
$templateIds = @('confirmation','invite','magic_link','email_change','recovery','reauthentication','password_changed_notification','email_changed_notification','phone_changed_notification','identity_linked_notification','identity_unlinked_notification','mfa_factor_enrolled_notification','mfa_factor_unenrolled_notification')
$eventIds = @('password_changed','email_changed','phone_changed','identity_linked','identity_unlinked','mfa_factor_enrolled','mfa_factor_unenrolled')
$expectedKeys = @($templateIds | ForEach-Object { "mailer_subjects_$_"; "mailer_templates_$($_)_content" }) + @($eventIds | ForEach-Object { "mailer_notifications_$($_)_enabled" })
if ($desired.Count -ne 33 -or @($desired.Keys | Where-Object { $_ -notin $expectedKeys }).Count -gt 0) { throw 'The package must contain exactly the 26 email fields and 7 notification switches.' }
foreach ($key in $expectedKeys) {
    if (-not $desired.ContainsKey($key)) { throw "Missing field: $key" }
    if ($key.EndsWith('_enabled')) {
        if ($desired[$key] -isnot [bool] -or $desired[$key] -ne $true) { throw "Expected enabled notification: $key" }
    } elseif ([string]::IsNullOrWhiteSpace($desired[$key])) { throw "Empty email field: $key" }
}

Write-Host 'Target: NextChina.org / Supabase project cznhnupwojmydttdattb'
Write-Host 'Scope: 13 email subjects and HTML bodies; enable 7 security notifications.'
Write-Host 'SMTP, redirects, providers, accounts, and website features are not changed.'
if (-not $Apply -and -not $VerifyOnly) {
    Write-Host 'Local validation passed. No network request was made.'
    Write-Host 'To save: pwsh -File ./apply.ps1 -Apply'
    Write-Host 'To check saved values only: pwsh -File ./apply.ps1 -VerifyOnly'
    exit 0
}

function Get-AuthConfig([hashtable]$Headers) {
    try { return Invoke-RestMethod -Uri $endpoint -Headers $Headers -Method Get -TimeoutSec 30 }
    catch { throw 'Could not read Auth settings. Check your connection and personal access token permissions. No response body or credential has been logged.' }
}
function Get-SelectedConfig($Config) {
    $selected = [ordered]@{}
    foreach ($key in $expectedKeys) {
        $property = $Config.PSObject.Properties[$key]
        if ($null -eq $property) { throw "Supabase did not return the required field $key. Nothing will be overwritten." }
        $selected[$key] = $property.Value
    }
    return $selected
}
function Get-Differences($Current) {
    return @($expectedKeys | Where-Object { $Current[$_] -cne $desired[$_] })
}

$secret = $null
$headers = @{}
try {
    Write-Host 'Enter a Supabase Personal Access Token locally. Do not use an anon/publishable/service_role key.'
    $secret = Read-Host 'Personal Access Token (hidden; not saved)' -AsSecureString
    if ($secret.Length -eq 0) { throw 'No token entered.' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $headers.Authorization = 'Bearer ' + [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }

    $current = Get-SelectedConfig (Get-AuthConfig $headers)
    $differences = @(Get-Differences $current)
    if ($differences.Count -eq 0) { Write-Host 'Verified: all 13 templates and 7 notification switches match. No change needed.'; exit 0 }
    Write-Host "$($differences.Count) of 33 email settings differ."
    if ($VerifyOnly) { $differences | ForEach-Object { Write-Host "Different: $_" }; exit 1 }

    $backupFolder = Join-Path $PSScriptRoot 'backups'
    $null = New-Item -ItemType Directory -Path $backupFolder -Force
    $backupFile = Join-Path $backupFolder ("email-settings-{0}.json" -f [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
    $current | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $backupFile -Encoding utf8
    Write-Host "Previous email settings backed up to: $backupFile"
    $payload = [Text.Encoding]::UTF8.GetBytes(($desired | ConvertTo-Json -Depth 8))
    try { $null = Invoke-RestMethod -Uri $endpoint -Method Patch -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $payload -TimeoutSec 30 }
    catch { throw 'Save request did not complete successfully. Its outcome may be uncertain; run -VerifyOnly before retrying. The previous email settings were backed up. No credentials have been logged.' }
    $saved = Get-SelectedConfig (Get-AuthConfig $headers)
    $remaining = @(Get-Differences $saved)
    if ($remaining.Count -gt 0) { throw "Save returned, but $($remaining.Count) fields did not match on readback. Review the dashboard; do not assume completion." }
    Write-Host 'Saved and verified: all 13 templates and all 7 security notification switches.'
    Write-Host 'No email was sent. SMTP delivery and any inactive website auth flows still require separate validation.'
} finally {
    $headers.Clear()
    if ($null -ne $secret) { $secret.Dispose() }
}
