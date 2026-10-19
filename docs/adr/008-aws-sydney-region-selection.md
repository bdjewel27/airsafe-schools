# ADR 008: AWS Sydney (ap-southeast-2) Region Selection

## Status
Accepted

## Context
AirSafe Schools requires deploying a full-stack serverless cloud backend comprising AWS Lambda, Amazon API Gateway, Amazon DynamoDB, Amazon SQS, Amazon Cognito, and Amazon Bedrock foundation models. Key considerations include:
1. **Amazon Bedrock Model Availability:** Foundation models required for grounded conversational reasoning (such as Anthropic Claude 3.5 Sonnet / Haiku and Amazon Nova) must be accessible with full `ConverseStream` streaming API support.
2. **Latency & Regional Proximity:** Serving school clients in Dhaka and Chittagong with low network round-trip time.
3. **Cost Predictability:** Standardized regional on-demand pricing to ensure compliance with the strict $100 credit budget limit.

## Decision
We select **AWS Sydney (`ap-southeast-2`)** as the primary deployment region for all AirSafe Schools serverless infrastructure:
1. **Model Availability:** `ap-southeast-2` provides first-class availability for Amazon Bedrock inference, streaming Converse APIs, and Bedrock Knowledge Bases.
2. **Feature Parity:** Full CDK stack support for SQS Dead Letter Queues, DynamoDB On-Demand with TTL, Cognito User Pools with Custom Attributes, and CloudWatch Log retention.
3. **Edge Acceleration:** API Gateway edge distribution and CloudFront edge points of presence across South Asia ensure low-latency HTTPS handshakes (<180 ms) for mobile clients in Bangladesh.

## Consequences
- Guaranteed availability of required generative AI models without cross-region VPC peering or latency penalty.
- Operational pricing aligned with published Sydney rates ($1.97/1M ingestion events, $0.45/100k API decisions).
- Simplifies CDK deployment scripts and operational runbooks by maintaining a single consistent region target.
