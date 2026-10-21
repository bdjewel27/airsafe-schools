#!/bin/bash
set -e

echo "=================================================="
echo "  AirSafe Schools - Android Release Build Helper  "
echo "=================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$SCRIPT_DIR/../android"

cd "$ANDROID_DIR"

if [ -z "$AIRSAFE_KEYSTORE_PASSWORD" ] || [ -z "$AIRSAFE_KEY_PASSWORD" ]; then
    echo "[WARN] Keystore credentials not provided in environment. Building Debug APK..."
    ./gradlew assembleDebug
    echo "[SUCCESS] Debug APK available at: $ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
else
    echo "[INFO] Building signed release APK..."
    ./gradlew assembleRelease
    echo "[SUCCESS] Release APK available at: $ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
fi
