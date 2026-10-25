# AirSafe Schools - Cryptographic JWT Secret Rotation & SSM Provisioning (PowerShell)
# Hard Gate 1 & Finding S9: Enforces high-entropy 256-bit secret stored in SSM SecureString with version tracking.
param(
    [string]$EnvironmentName = "dev",
    [string]$Region = "ap-southeast-2"
)

$ErrorActionPreference = "Stop"

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$versionId = "v-$timestamp"

Write-Host "=== AirSafe Schools: Generating New Cryptographic JWT Secret ($versionId) ===" -ForegroundColor Cyan
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$newSecret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""

$parameterName = "/airsafe/$EnvironmentName/jwt-secret"
Write-Host "Setting SSM SecureString Parameter: $parameterName (Version: $versionId) in $Region..." -ForegroundColor Yellow

$putResult = aws ssm put-parameter `
    --name "$parameterName" `
    --type "SecureString" `
    --value "$newSecret" `
    --description "AirSafe HMAC-SHA256 Scoped JWT Secret for $EnvironmentName - $versionId" `
    --overwrite `
    --region "$Region" | ConvertFrom-Json

aws ssm add-tags-to-resource `
    --resource-type "Parameter" `
    --resource-id "$parameterName" `
    --tags "Key=Version,Value=$versionId" "Key=RotatedAt,Value=$timestamp" `
    --region "$Region"

Write-Host " Successfully rotated and stored new secret in SSM: $parameterName (SSM Version: $($putResult.Version), Tag: $versionId)" -ForegroundColor Green
Write-Host "Config version tracking enabled. Previous secret versions remain intact in SSM parameter history." -ForegroundColor Magenta
