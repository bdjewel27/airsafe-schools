# AirSafe Schools - Cryptographic JWT Secret Rotation & SSM Provisioning (PowerShell)
# Hard Gate 1: Enforces high-entropy 256-bit secret stored in SSM SecureString.
param(
    [string]$EnvironmentName = "dev",
    [string]$Region = "ap-southeast-2"
)

$ErrorActionPreference = "Stop"

Write-Host "=== AirSafe Schools: Generating New Cryptographic JWT Secret ===" -ForegroundColor Cyan
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$newSecret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""

$parameterName = "/airsafe/$EnvironmentName/jwt-secret"
Write-Host "Setting SSM SecureString Parameter: $parameterName in $Region..." -ForegroundColor Yellow

aws ssm put-parameter `
    --name "$parameterName" `
    --type "SecureString" `
    --value "$newSecret" `
    --description "AirSafe HMAC-SHA256 Scoped JWT Secret for $EnvironmentName" `
    --overwrite `
    --region "$Region"

Write-Host " Successfully rotated and stored new secret in SSM: $parameterName" -ForegroundColor Green
Write-Host "Old public secret 'REDACTED_HMAC_SECRET' is now REVOKED." -ForegroundColor Magenta
