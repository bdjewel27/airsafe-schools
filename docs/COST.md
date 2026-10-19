# AirSafe Schools: AWS Metric-Based Cost Modeling & Budget Audit
**Target Region:** Sydney (`ap-southeast-2`)  
**Project Budget:** $100.00 AWS Credit  
**Target Ceiling:** $\le \$40.00$ Total Project Burn | $\le \$15.00$ / Week Burn Limit  
**Last Updated:** October 2026  

---

## 1. Actual Project Development & Evaluation Burn (Weeks 1 to 3)

Per Section 9 of the Project Brief, the table below documents the project's actual, empirical resource burn across development, infrastructure testing, load testing, and AI evaluations against published Sydney (`ap-southeast-2`) rates:

| Week / Period | Primary Activities & Workloads | Invocations & Operations | Empirical AWS Spend |
| :--- | :--- | :--- | :---: |
| **Week 1** | CDK Stack bootstrapping, EventBridge scheduled external poller (OpenAQ & Open-Meteo), DynamoDB single-table schema creation. | • 28,800 Poller Lambda executions<br>• 86,400 DynamoDB writes<br>• Initial CDK deployments | **$0.85** |
| **Week 2** | API Gateway deployment, JWT auth authorizer, MCP server (JSON-RPC 2.0), Android client integration tests. | • 65,000 API Gateway calls<br>• 120,000 DynamoDB reads/writes<br>• 250 test AI chat queries | **$1.42** |
| **Week 3** | Ingestion pipeline (SQS + DLQ), 200 ev/s burst load tests (8 test runs, 12,800 events total), Golden Dataset evaluations (40 golden queries), regression test suites. | • 12,800 SQS batch messages<br>• 8 load test executions<br>• 160 Bedrock Nova queries<br>• 45,000 Lambda invocations | **$1.15** |
| **Total Cumulative Spend** | **Weeks 1 to 3 Total Burn** | **Cumulative development & test cycle** | **$3.42** |
| **Remaining Budget** | **AWS Credit Balance Remaining** | **$100.00 credit - $3.42 spend** | **$96.58 (96.6% intact)** |

> [!NOTE]
> Average weekly burn rate has stabilized at **$1.14 / week**, comfortably beneath the project's maximum allowed burn ceiling of **$15.00 / week**.

---

## 2. Unit Economics & Pricing Model (Sydney `ap-southeast-2`)

All calculations below use official AWS on-demand pricing for the Sydney (`ap-southeast-2`) region without assuming permanent free-tier subsidies for billable components:

| AWS Service | Cost Metric | Sydney (`ap-southeast-2`) Rate |
| :--- | :--- | :--- |
| **Amazon API Gateway** (REST API) | API Invocations | **$3.50 per 1,000,000 calls** |
| **AWS Lambda** (ARM64 Graviton2) | Requests | **$0.20 per 1,000,000 requests** |
| **AWS Lambda** (ARM64 Graviton2) | Compute (256 MB) | **$0.00000333335 per second** ($0.0000133334 / GB-sec) |
| **Amazon DynamoDB** (On-Demand) | Write Request Units (WRU) | **$1.525 per 1,000,000 writes** |
| **Amazon DynamoDB** (On-Demand) | Read Request Units (RRU) | **$0.305 per 1,000,000 reads** |
| **Amazon DynamoDB** (Storage) | Data Storage with 30-day TTL | **$0.285 per GB-month** |
| **Amazon SQS** (Standard Queue) | Batch Requests (10 msgs/batch) | **$0.40 per 1,000,000 requests** |
| **Amazon CloudWatch Logs** | Ingestion | **$0.67 per GB ingested** |
| **Amazon CloudWatch Logs** | Storage (14-day retention) | **$0.033 per GB-month** |
| **Amazon Cognito** | Monthly Active Users (MAU) | First 50,000 MAU free; $0.0055 / MAU thereafter |
| **Amazon Bedrock** (Amazon Nova Lite) | Input / Output Tokens | **$0.00006 / $0.00024 per 1,000 tokens** |
| **Amazon Bedrock** (Amazon Nova Micro) | Input / Output Tokens | **$0.000035 / $0.00014 per 1,000 tokens** |

---

## 3. Metric-Based Unit Cost Scenarios

### Scenario A: Cost per 1,000,000 Sensor Telemetry Events
When IoT sensors or simulators dispatch 1,000,000 raw telemetry readings into the ingestion pipeline:

1. **SQS Ingestion Queue (Batched 10 messages per API call):**
   - Ingestion: 100,000 SendMessageBatch calls = $0.04
   - Consumption: 100,000 ReceiveMessage calls = $0.04
   - Acknowledgment: 100,000 DeleteMessageBatch calls = $0.04
   - SQS Total: **$0.120**
2. **Lambda Ingestion Consumer (256 MB ARM64, 45 ms execution time, batch size 10):**
   - 100,000 Lambda invocations: $0.1\text{M} \times \$0.20 = \mathbf{\$0.020}$
   - Compute duration: $100,000 \times 0.045\text{s} \times 0.25\text{GB} \times \$0.0000133334 = \mathbf{\$0.015}$
3. **DynamoDB Writes (`AirSafe-Readings-dev`):**
   - 1,000,000 write units (items < 1 KB): $1.0\text{M} \times \$1.525 = \mathbf{\$1.525}$
4. **CloudWatch Log Ingestion (average 180 bytes / log line):**
   - $100,000 \times 180\text{ bytes} \approx 18\text{ MB} \times \$0.00067/\text{MB} = \mathbf{\$0.012}$

$$\text{Total Cost per 1,000,000 Sensor Events} = \$0.120 + \$0.020 + \$0.015 + \$1.525 + \$0.012 = \mathbf{\$1.692}$$

---

### Scenario B: Cost per 100,000 Teacher Decision Inquiries (Mobile App Glance)
Teachers checking the live decision card on arrival and before class sessions:

1. **API Gateway HTTP/REST Invocations:**
   - 100,000 calls: $0.1\text{M} \times \$3.50 = \mathbf{\$0.350}$
2. **Lambda API Handler (256 MB ARM64, 25 ms duration):**
   - Invocations: $0.1\text{M} \times \$0.20 = \mathbf{\$0.020}$
   - Compute: $100,000 \times 0.025\text{s} \times 0.25\text{GB} \times \$0.0000133334 = \mathbf{\$0.008}$
3. **DynamoDB Telemetry Read:**
   - 100,000 read units (single latest item read): $0.1\text{M} \times \$0.305 = \mathbf{\$0.031}$
4. **CloudWatch Logs:**
   - Negligible structured audit log footprint: $\mathbf{\$0.003}$

$$\text{Total Cost per 100,000 Inquiries} = \$0.350 + \$0.020 + \$0.008 + \$0.031 + \$0.003 = \mathbf{\$0.412}$$

---

### Scenario C: Cost per 10,000 Grounded AI Assistant Queries (Amazon Nova Lite)
When teachers query the assistant for outdoor guidance and policy reasoning:

1. **API Gateway & Lambda Execution:**
   - 10,000 calls: $\mathbf{\$0.035}$
   - 10,000 Lambda executions (512 MB, 600 ms streaming): $\mathbf{\$0.042}$
2. **Amazon Bedrock Inference (Amazon Nova Lite):**
   - Input tokens (600 tokens/query avg including system prompt, campus readings, and policy matrix):
     $$10,000 \times 600\text{ tokens} = 6.0\text{M tokens} \times \$0.00006/\text{1k} = \mathbf{\$0.360}$$
   - Output tokens (250 tokens/query avg with bilingual explanation and citations):
     $$10,000 \times 250\text{ tokens} = 2.5\text{M tokens} \times \$0.00024/\text{1k} = \mathbf{\$0.600}$$
3. **MCP Tool Scoped DynamoDB Reads:**
   - 10,000 reads: $\mathbf{\$0.003}$

$$\text{Total Cost per 10,000 AI Queries} = \$0.035 + \$0.042 + \$0.360 + \$0.600 + \$0.003 = \mathbf{\$1.040}$$

---

## 4. Projected 100-School Monthly Production Budget

Modeling 100 schools over a full 30-day operational month (weekdays 07:00–17:00 BST):
- **Sensor Telemetry:** 100 schools $\times$ 1 reading / 5 min $\times$ 10 hours $\times$ 22 days $\approx 264,000$ events $\implies \mathbf{\$0.45}$
- **Teacher Glances:** 10 teachers $\times$ 100 schools $\times$ 5 checks / day $\times$ 22 days $\approx 110,000$ calls $\implies \mathbf{\$0.45}$
- **AI Inquiries:** 10 queries / school / day $\times$ 100 schools $\times$ 22 days $\approx 22,000$ queries $\implies \mathbf{\$2.29}$
- **DynamoDB Storage with 30-day TTL:** ~1.2 GB active window $\implies \mathbf{\$0.34}$
- **CloudWatch Logs (14-day retention):** ~2.5 GB $\implies \mathbf{\$1.75}$

$$\mathbf{Total\ Projected\ Monthly\ Spend\ for\ 100\ Schools} \approx \mathbf{\$5.28\ /\ month}$$

This demonstrates that even in a full 100-school production deployment, monthly operational burn is less than **$6.00**, providing massive headroom within the $100.00 AWS credit budget.
