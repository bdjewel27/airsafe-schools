#!/bin/bash
set -e

REGION="ap-southeast-2"
DOC_FILE="docs/day1-checks.md"

echo "# Day 1 Capability Checks" > $DOC_FILE
echo "Execution Date: $(date)" >> $DOC_FILE
echo "" >> $DOC_FILE

echo "--- Checking Bedrock Models in $REGION ---"
echo "## 1. Bedrock Models" >> $DOC_FILE

# Test Nova Lite
echo -n "Checking amazon.nova-lite-v1:0... "
if aws bedrock-runtime converse --region $REGION --model-id amazon.nova-lite-v1:0 --messages '[{"role":"user","content":[{"text":"Hi"}]}]' --inference-config '{"maxTokens":5}' > /dev/null 2>&1; then
    echo "SUCCESS"
    echo "- **amazon.nova-lite-v1:0**: Supported in $REGION" >> $DOC_FILE
else
    echo "FAILED"
    echo "- **amazon.nova-lite-v1:0**: FAILED/Not supported in $REGION" >> $DOC_FILE
fi

# Test Nova Micro
echo -n "Checking amazon.nova-micro-v1:0... "
if aws bedrock-runtime converse --region $REGION --model-id amazon.nova-micro-v1:0 --messages '[{"role":"user","content":[{"text":"Hi"}]}]' --inference-config '{"maxTokens":5}' > /dev/null 2>&1; then
    echo "SUCCESS"
    echo "- **amazon.nova-micro-v1:0**: Supported in $REGION" >> $DOC_FILE
else
    echo "FAILED"
    echo "- **amazon.nova-micro-v1:0**: FAILED/Not supported in $REGION" >> $DOC_FILE
fi

# Test Titan Embed Text v2 (Sydney vs us-east-1)
echo -n "Checking amazon.titan-embed-text-v2:0 in $REGION... "
if aws bedrock-runtime invoke-model --region $REGION --model-id amazon.titan-embed-text-v2:0 --body '{"inputText":"test"}' --cli-binary-format raw-in-base64-out /dev/null > /dev/null 2>&1; then
    echo "SUCCESS"
    echo "- **amazon.titan-embed-text-v2:0**: Supported in $REGION" >> $DOC_FILE
else
    echo "FAILED (Checking us-east-1 alternative)"
    echo -n "Checking amazon.titan-embed-text-v2:0 in us-east-1... "
    if aws bedrock-runtime invoke-model --region us-east-1 --model-id amazon.titan-embed-text-v2:0 --body '{"inputText":"test"}' --cli-binary-format raw-in-base64-out /dev/null > /dev/null 2>&1; then
        echo "SUCCESS in us-east-1"
        echo "- **amazon.titan-embed-text-v2:0**: Available in us-east-1 (Fallback permitted by brief)" >> $DOC_FILE
    else
        echo "FAILED"
        echo "- **amazon.titan-embed-text-v2:0**: FAILED in both regions" >> $DOC_FILE
    fi
fi

echo "" >> $DOC_FILE
echo "## 2. Service Quotas" >> $DOC_FILE
echo "Checking Lambda Concurrency Quota..."
LAMBDA_QUOTA=$(aws service-quotas get-service-quota --service-code lambda --quota-code L-B99A9384 --region $REGION --query 'Quota.Value' --output text 2>/dev/null || echo "Unable to fetch")
echo "- **Lambda Concurrent Executions Quota**: $LAMBDA_QUOTA" >> $DOC_FILE
echo "Lambda Concurrent Executions: $LAMBDA_QUOTA"

echo ""
echo "=== Check Completed! Results saved in $DOC_FILE ==="
