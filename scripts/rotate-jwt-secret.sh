#!/usr/bin/env bash
# AirSafe Schools - Cryptographic JWT Secret Rotation & SSM Provisioning
# Hard Gate 1 & Finding S9: Enforces high-entropy 256-bit secret stored in SSM SecureString with version tracking.
set -euo pipefail

ENV_NAME="${1:-dev}"
PARAMETER_NAME="/airsafe/${ENV_NAME}/jwt-secret"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
VERSION_ID="v-${TIMESTAMP}"

echo "=== AirSafe Schools: Generating New Cryptographic JWT Secret (${VERSION_ID}) ==="
NEW_SECRET=$(openssl rand -hex 32)

echo "Setting SSM SecureString Parameter: $PARAMETER_NAME (Version: $VERSION_ID) in $AWS_REGION..."
PUT_OUTPUT=$(aws ssm put-parameter \
  --name "$PARAMETER_NAME" \
  --type "SecureString" \
  --value "$NEW_SECRET" \
  --description "AirSafe HMAC-SHA256 Scoped JWT Secret for $ENV_NAME - $VERSION_ID" \
  --overwrite \
  --region "$AWS_REGION")

aws ssm add-tags-to-resource \
  --resource-type "Parameter" \
  --resource-id "$PARAMETER_NAME" \
  --tags "Key=Version,Value=$VERSION_ID" "Key=RotatedAt,Value=$TIMESTAMP" \
  --region "$AWS_REGION"

echo "✅ Successfully rotated and stored new secret in SSM: $PARAMETER_NAME ($VERSION_ID)"
echo "Config version tracking enabled. Previous secret versions remain intact in SSM parameter history."
