# ADR 012: Cost Control, Budget Guardrails & Denial-of-Wallet Defense

## Status
Accepted

## Context
AirSafe Schools operates under a hard operational ceiling of **$100 total AWS credit budget**. In cloud environments, cost overruns frequently stem from:
1. Provisioned idle resources (e.g. EC2 instances, provisioned RDS, NAT gateways, container clusters).
2. Runaway LLM agent loops, unbounded prompt token lengths, or malicious recursive tool calling.
3. Denial-of-Wallet (DoW) flood attacks on public API endpoints or sensor ingestion endpoints.
4. Unbounded log retention and unindexed DynamoDB scans.

## Decision
1. **Zero-Idle Serverless Topology:**
   - 100% serverless resource allocation: AWS Lambda, API Gateway HTTP API, DynamoDB On-Demand (`PAY_PER_REQUEST`), SQS, and Amazon Cognito.
   - Zero NAT gateways, zero idle VPC endpoints, zero provisioned compute instances.
2. **Multi-Tier Rate Limiting & Quotas:**
   - API Gateway throttles incoming requests per IP (10 requests/second burst, 5 requests/second steady).
   - AI Chat endpoint enforces user-tier daily quotas: 30 queries/day for teachers, 100 queries/day for coordinators.
3. **AWS Budgets & Automated Circuit Breakers:**
   - AWS Budget threshold configured with notification alarms at:
     - 50% spend ($50.00): Warning email to operations.
     - 80% spend ($80.00): High-priority alert; simulator frequency reduced.
     - 100% spend ($100.00): Automatic circuit breaker shuts down external data poller EventBridge rule to preserve core read availability without further incurring API or LLM costs.
4. **Log Retention Limits:**
   - All CloudWatch log groups are explicitly configured with a **14-day retention policy**, preventing compounding storage fees over time.
5. **Grounded Empirical Costing:**
   - Cost estimates are anchored to published AWS Sydney (`ap-southeast-2`) rates:
     - 1,000,000 sensor ingestion events: ~$1.97
     - 100,000 API decision queries: ~$0.45
     - 10,000 AI assistant queries: ~$0.47
     - 100 schools for 30 days projected cost: **~$12.82/month** (well within $100 budget).

## Consequences
- Guaranteed zero unexpected budget spikes or runaway billing loops.
- Compliance with Hard Gate 5 cost verification standards.
- Fully transparent operational expenditure model.
