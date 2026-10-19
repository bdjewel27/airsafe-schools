# Day 1 Capability Checks & Baseline

## 1. Bedrock Models Verification
- **Project Region**: `ap-southeast-2` (Sydney)
- **amazon.nova-lite-v1:0**: Quota 0.0 (ThrottlingException)
- **amazon.nova-micro-v1:0**: Quota 0.0 (ThrottlingException)
- **amazon.titan-text-express-v1**: Deprecated / End of life
- **amazon.titan-embed-text-v2:0**: Available via `us-east-1` fallback (Approved per Project Brief)

## 2. Quota Status
- **Lambda Concurrent Executions**: 10.0
- **Bedrock Nova On-Demand Token Quota**: 0.0

## 3. Architecture Decision
- Recorded in ADR-001.
