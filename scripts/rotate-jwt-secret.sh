#!/usr/bin/env bash
# AirSafe Schools - Cryptographic JWT Secret Rotation & SSM Provisioning
# Hard Gate 1: Enforces high-entropy 256-bit secret stored in SSM SecureString.
set -euo pipefail

ENV_NAME="${1:-dev}"
PARAMETER_NAME="/airsafe/${ENV_NAME}/jwt-secret"
AWS_REGION="${AWS_REGION:-ap-southeast-2}"

echo "=== AirSafe Schools: Generating New Cryptographic JWT Secret ==="
NEW_SECRET=$(openssl rand -hex 32)

echo "Setting SSM SecureString Parameter: $PARAMETER_NAME in $AWS_REGION..."
aws ssm put-parameter \
  --name "$PARAMETER_NAME" \
  --type "SecureString" \
  --value "$NEW_SECRET" \
  --description "AirSafe HMAC-SHA256 Scoped JWT Secret for $ENV_NAME" \
  --overwrite \
  --region "$AWS_REGION"

echo "✅ Successfully rotated and stored new secret in SSM: $PARAMETER_NAME"
echo "Old public secret 'REDACTED_HMAC_SECRET' is now REVOKED."
