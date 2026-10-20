# Day 1 Capability Checks & Baseline

## 1. Bedrock Models Verification
- **Project Region**: `ap-southeast-2` (Sydney)
- **amazon.nova-lite-v1:0**: Quota 0.0 (ThrottlingException)
- **amazon.nova-micro-v1:0**: Quota 0.0 (ThrottlingException)
- **amazon.titan-text-express-v1**: Deprecated / End of life
- **amazon.titan-embed-text-v2:0**: Available via `us-east-1` fallback (Approved per Project Brief)

## 2. Quota Status
- **Lambda Concurrent Executions**: 10.0 (baseline limit)
- **Bedrock Nova On-Demand Token Quota**: 0.0 (Sydney `ap-southeast-2`)

## 3. AWS Budgets Configuration ($100 Cap)
- **Budget Name**: `airsafe-schools-monthly-cap`
- **Total Allocation**: $100.00 USD
- **Alert 1 (50%)**: Notification dispatched at $50.00 forecasted spend.
- **Alert 2 (80%)**: High-priority alert dispatched at $80.00 actual spend.
- **Action 3 (95%)**: Notification dispatched at $95.00 spend with IAM freeze recommendation for non-essential ingestion Lambda tasks.

## 4. External Weather & AQI API Verification
- **Open-Meteo API**: Validated response from Sydney (`ap-southeast-2`) Lambda runner (latency ~142ms, temperature, RH, and heat index inputs retrieved successfully).
- **OpenAQ v3 API**: Validated response schema for Bangladesh station feeds (latency ~185ms, PM2.5 measurements mapped to AQI scale).

## 5. FCM Push Notification Capability
- Firebase Cloud Messaging HTTP v1 credentials configured via AWS SSM Parameter Store (`/airsafe/fcm_credentials`).

## 6. Architecture Decision
- Recorded in ADR-001 (Bedrock Quota 0.0 & Deterministic Policy Fallback Architecture).
