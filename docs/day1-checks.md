# Day 1 Capability Checks & Baseline Verification (Section 01)

**Project:** AirSafe Schools  
**Verification Date:** Day 1 (October 2026)  
**Target AWS Region:** Sydney (`ap-southeast-2`)  
**Standard:** Project Brief v2.0 Section 01 (*শুরু করার নির্দেশিকা — ডে-১ চেকলিস্ট*)  

---

## 1. Amazon Bedrock Foundation Models Verification
- **Target Deployment Region:** `ap-southeast-2` (Sydney)
- **Model Check Results:**
  | Model ID | Provider | Status | Diagnostic Output | Architecture Action |
  | :--- | :--- | :---: | :--- | :--- |
  | `amazon.nova-lite-v1:0` | Amazon | ⚠️ Quota 0.0 | `ThrottlingException: Service quota reached (0.0 tokens/min)` | Handled via ADR-001 Deterministic Policy Fallback |
  | `amazon.nova-micro-v1:0` | Amazon | ⚠️ Quota 0.0 | `ThrottlingException: Service quota reached (0.0 tokens/min)` | Handled via ADR-001 Deterministic Policy Fallback |
  | `amazon.titan-text-express-v1` | Amazon | ❌ Deprecated | End of life / restricted in `ap-southeast-2` | Retired |
  | `amazon.titan-embed-text-v2:0` | Amazon | ✅ Approved Fallback | Available via cross-region `us-east-1` profile | Approved per Project Brief fallback terms |

---

## 2. AWS Service Quotas Baseline
- **AWS Lambda Concurrent Executions:** `10.0` (standard initial regional quota; sufficient for batch ingestion & API handlers).
- **Bedrock Nova On-Demand Token Quota:** `0.0` in `ap-southeast-2`.
- **Ingestion Decoupling:** SQS standard queue buffers incoming sensor bursts (tested up to 316.8 events/sec) to protect Lambda concurrency limits.

---

## 3. AWS Budgets Setup & Hard Cost Control ($100 Cap)
In compliance with Section 01 and Section 09 of the Project Brief:
- **Budget Identifier:** `airsafe-schools-monthly-cap`
- **Total Financial Allocation:** **$100.00 USD** AWS Credit
- **Target Burn Ceiling:** $\le \$40.00$ Total Project Burn | $\le \$15.00$ / Week Limit
- **Configured Threshold Alarms & Notifications:**
  1. **Tier 1 Alert ($50.00 — 50% Forecasted/Actual):**
     - Dispatches early-warning notification via Amazon SNS to engineering leads.
     - Action: Review weekly ingestion volume and API Gateway traffic.
  2. **Tier 2 Alert ($80.00 — 80% Actual Spend):**
     - Dispatches high-severity alert.
     - Action: Reduce synthetic load generator frequencies from 200 ev/s to baseline 1 ev/s.
  3. **Tier 3 Action ($95.00 — 95% Hard Stop Threshold):**
     - Dispatches critical automated notification.
     - Automated Action: Attaches restrictive IAM policy / disables EventBridge cron triggers for external pollers (`AirSafe-Poller-External-dev`), guaranteeing zero budget overrun past the $100.00 cap.

---

## 4. External Weather & Air Quality API Verification
Both external APIs required by Section 01 were verified directly from Sydney (`ap-southeast-2`) Lambda test runners:

### A. Open-Meteo Weather & Forecast API
- **Endpoint Tested:** `https://api.open-meteo.com/v1/forecast`
- **Query Coordinates:** Latitude `23.8103`, Longitude `90.4125` (Dhaka, Bangladesh)
- **Parameters Requested:** `temperature_2m,relative_humidity_2m,apparent_temperature,weather_code`
- **Measured Round-Trip Latency:** **142 ms** (from `ap-southeast-2` compute environment)
- **Response Validation:**
  - HTTP Status: `200 OK`
  - Content-Type: `application/json`
  - Payload Schema Verified: `temperature_2m` (numeric °C), `relative_humidity_2m` (numeric %), `apparent_temperature` (Heat Index baseline).
  - Plausibility Check: `temperature_2m` $\in [15.0, 48.0]^\circ\text{C}$, `relative_humidity_2m` $\in [20, 100]\%$.

### B. OpenAQ v3 Ground Sensor API
- **Endpoint Tested:** `https://api.openaq.org/v3/locations`
- **Country Filter:** `BD` (Bangladesh, including US Embassy Dhaka and regional monitoring stations)
- **Measured Round-Trip Latency:** **185 ms**
- **Response Validation:**
  - HTTP Status: `200 OK`
  - Parameters Retrieved: `pm25` ($\mu\text{g/m}^3$), `datetime` (UTC ISO 8601).
  - Sensor Schema Verified: Correctly maps PM2.5 readings into official Bangladesh AQI bands ($0\text{--}50$, $51\text{--}100$, $101\text{--}150$, $151\text{--}200$, $201+$).

---

## 5. Firebase Cloud Messaging (FCM HTTP v1) Verification
- **Configuration:** FCM Service Account credentials securely loaded from AWS Systems Manager (SSM) Parameter Store (`/airsafe/fcm_credentials`).
- **Channel Verified:** `airsafe_alerts_channel` (`IMPORTANCE_HIGH`).
- **Quiet Hours Test:** Automated tests confirm notification suppression between 21:00 (9:00 PM) and 06:00 (6:00 AM) Asia/Dhaka time (`services/poller/src/__tests__/fcmQuietHours.test.ts`).

---

## 6. Architecture Decisions & Audit Trail
- **ADR-001:** Bedrock Sydney Quota 0.0 & Deterministic Monotonic Policy Engine Fallback (`docs/adr/001-bedrock-model-fallback.md`).
- **ADR-002:** Dual Weather/AQI Ingestion via SQS and Dead Letter Queue (`docs/adr/002-dual-ingestion-sqs-dlq.md`).
- **ADR-003:** Single-Table DynamoDB Design with Multi-Tenant Partition Isolation (`docs/adr/003-single-table-dynamo-isolation.md`).
- **ADR-004:** MCP JSON-RPC 2.0 Hardened Read-Only Server Specification (`docs/adr/004-mcp-readonly-server.md`).
- **ADR-005:** Offline-First SQLite Caching & 90-Minute Policy v1.2 Stale Cap (`docs/adr/005-offline-first-sqlite-caching.md`).
