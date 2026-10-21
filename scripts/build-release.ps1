# AirSafe Schools - Release APK Build Script
# Builds the production release APK for physical device installation & GitHub Releases

param (
    [string]$KeystorePassword = $env:AIRSAFE_KEYSTORE_PASSWORD,
    [string]$KeyPassword = $env:AIRSAFE_KEY_PASSWORD
)

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  AirSafe Schools - Android Release Build Helper  " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$androidDir = Join-Path $projectRoot "android"

# Check JAVA_HOME
if (-not $env:JAVA_HOME) {
    if (Test-Path "E:\AndroidStudio\jbr") {
        $env:JAVA_HOME = "E:\AndroidStudio\jbr"
        $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
        Write-Host "[OK] Detected Android Studio JBR: $env:JAVA_HOME" -ForegroundColor Green
    } else {
        Write-Error "JAVA_HOME environment variable is not set. Please set JAVA_HOME before building."
    }
}

Set-Location $androidDir

if (-not $KeystorePassword -or -not $KeyPassword) {
    Write-Host "[WARN] Keystore credentials not provided. Assembling Debug APK instead..." -ForegroundColor Yellow
    .\gradlew.bat assembleDebug
    $apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        Write-Host "`n[SUCCESS] Debug APK generated at:" -ForegroundColor Green
        Write-Host "  $apkPath" -ForegroundColor White
    }
} else {
    Write-Host "[INFO] Assembling signed release APK with fail-closed credentials..." -ForegroundColor Cyan
    $env:AIRSAFE_KEYSTORE_PASSWORD = $KeystorePassword
    $env:AIRSAFE_KEY_PASSWORD = $KeyPassword
    .\gradlew.bat assembleRelease
    $apkPath = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
    if (Test-Path $apkPath) {
        Write-Host "`n[SUCCESS] Signed Release APK generated at:" -ForegroundColor Green
        Write-Host "  $apkPath" -ForegroundColor White
        Write-Host "`nReady to upload to GitHub Releases: https://github.com/bdjewel27/airsafe-schools/releases" -ForegroundColor Cyan
    }
}
