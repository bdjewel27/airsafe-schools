# ADR 001: Bedrock Quota Limitation & Fallback Strategy

## Status
Accepted

## Context
Initial capability verification in Sydney (`ap-southeast-2`) revealed that Amazon Nova models have default service quotas set to 0.0 on the Builder tier. Titan Text Express is End-of-Life. Titan Embed Text v2 operates reliably under the permitted `us-east-1` fallback.

## Decision
1. Proceed with project core build using deterministic heuristic/mock summary within Lambda to avoid blocking.
2. Request quota increase via AWS Service Quotas for Nova Micro.
