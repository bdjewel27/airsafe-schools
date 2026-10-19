# ADR 002: Serverless Architecture & Zero Idle Spend Guarantee

## Status
Accepted

## Context
Project Brief v2.0 Section 9 enforces a strict budget ceiling of $100 in AWS credits with an uncompromising mandate: **"Zero idle spend"**. Provisioned containers (ECS/Fargate), dedicated virtual machines (EC2), and provisioned database IOPS incur continuous hourly costs regardless of actual school query volume.

## Decision
1. Implement a 100% serverless event-driven architecture using AWS Lambda and Amazon EventBridge.
2. Configure Amazon DynamoDB in `PAY_PER_REQUEST` (On-Demand) capacity mode with automatic 30-day Time-To-Live (TTL) expiration on all reading telemetry items.
3. Exclude NAT Gateways, VPC Endpoints with hourly standing fees, and Provisioned Concurrency.
4. Host mobile API endpoints behind Amazon API Gateway HTTP APIs (v2) to leverage per-request billing within AWS Free Tier limits (1,000,000 free requests/month).

## Consequences
- Standing idle cost is exactly $0.00/month.
- Eliminates any risk of budget exhaustion during periods of school vacation or nighttime inactivity.
- Cold start overhead on first invocation is mitigated through lightweight Node.js/TypeScript bundled runtimes (< 300 ms).
