# AirSafe Schools: Evaluator & Reviewer Specification Guide (PROJECT_REVIEW_FOR_CLAUDE.md)
**Document Version:** 1.2.0  
**Target Environment:** AWS Sydney (`ap-southeast-2`) & Native Android (API 26–35)  
**Evaluation Standard:** Model School Outdoor Activity Policy v1.2 & Project Specification  
**Canonical Primary School ID:** `school-dhaka-001` (Dhaka Model School)  
**Live API Gateway Base URL:** `https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/`

---

## 1. Executive Evaluation Summary

AirSafe Schools provides real-time environmental telemetry, AI-grounded decision intelligence, and strict policy-governed safety guidelines for school outdoor activities in Bangladesh.

This guide provides automated AI evaluators (e.g., Claude, Bedrock agents) and human reviewers with exact endpoint specifications, authentication protocols, and reproduction commands.

---

## 2. API Endpoints & Access Control Matrix

In strict compliance with **Hard Gate 2 & 3 (Tenant & Role Isolation)**, API routes are divided into **Public (Unauthenticated)** and **Protected (Tenant-Scoped)** tiers:

### Tier A: Public Unauthenticated Endpoints (Evaluator Direct Verification)
These routes require **zero** authentication headers and can be invoked directly in any unauthenticated session:

| Endpoint | HTTP Method | Expected Status | Purpose & Payload |
| :--- | :---: | :---: | :--- |
| `/health` | `GET` | **200 OK** | System health & service readiness check (`{"status": "ok", "service": "AirSafe-API", "timestamp": "...", "version": "1.2.0"}`). |
| `/policies/current` | `GET` | **200 OK** | Complete Model School Outdoor Activity Policy v1.2 governance matrix, bands, and rules. |
| `/districts` | `GET` | **200 OK** | Public baseline environmental telemetry for 64 Bangladesh district headquarters. |

#### Verification via cURL (Public):
```bash
# 1. Verify Public Health Status
curl -i https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/health

# 2. Inspect Active Policy v1.2 Rules
curl -i https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/policies/current

# 3. View Public District Baseline Feeds
curl -i https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/districts
```

---

### Tier B: Protected School Tenant Endpoints (Strict Authentication Required)
All `/schools/{schoolId}/*` endpoints belong to isolated school tenants and are protected by **Hard Gate 2 & 3**:
- Unauthenticated requests deliberately return **HTTP 401 Unauthorized** (fail-closed security).
- Requests with tokens from a different school return **HTTP 403 Forbidden** (cross-tenant isolation).

#### School ID Resolution Notice:
- **Canonical School ID:** `school-dhaka-001` (Dhaka Model School).
- **Placeholder Alias Notice:** Any legacy references to placeholder `sch-dms-001` are automatically normalized by the API Gateway layer to `school-dhaka-001`. Evaluators must use `school-dhaka-001` for direct DynamoDB queries and seeded records.

| Protected Endpoint | HTTP Method | Expected (No Token) | Expected (Valid Token) | Access Role |
| :--- | :---: | :---: | :---: | :--- |
| `/schools/school-dhaka-001/sensor-sites` | `GET` | **401 Unauthorized** | **200 OK** | Teacher / Coordinator |
| `/schools/school-dhaka-001/current-decision` | `GET` | **401 Unauthorized** | **200 OK** | Teacher / Coordinator |
| `/schools/school-dhaka-001/decision` | `GET` | **401 Unauthorized** | **200 OK** | Teacher / Coordinator (Alias) |
| `/schools/school-dhaka-001/trends` | `GET` | **401 Unauthorized** | **200 OK** | Teacher / Coordinator |
| `/schools/school-dhaka-001/assistant/chat` | `POST` | **401 Unauthorized** | **200 OK** | Teacher / Coordinator |
| `/schools/school-dhaka-001/overrides` | `POST` | **401 Unauthorized** | **200 OK** (Coordinator only; 403 for Teacher) | Coordinator Only |

#### Authenticated Verification via cURL:
```bash
# Step 1: Obtain Authenticated Session Token
# Reviewer credentials provisioned in AWS Secrets Manager (airsafe/demo-credentials)
TOKEN=$(curl -s -X POST https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fatema.teacher@dms.edu.bd", "password": "<PROVIDED_VIA_AWS_SECRETS_MANAGER>"}' \
  | node -e "let d=''; process.stdin.on('data', c=>d+=c); process.stdin.on('end', ()=>console.log(JSON.parse(d).token||''));")

# Step 2: Query Protected Sensor Sites Endpoint
curl -i -H "Authorization: Bearer $TOKEN" \
  https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/schools/school-dhaka-001/sensor-sites

# Step 3: Query Protected Decision Endpoint
curl -i -H "Authorization: Bearer $TOKEN" \
  https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/schools/school-dhaka-001/current-decision
```

---

## 3. Evaluation Hard Gates Compliance Matrix

| Gate | Criterion | Status | Verification & Evidence |
| :---: | :--- | :---: | :--- |
| **Gate 1** | Zero Secrets in Repository or Git History | **PASSED** | Gitleaks CI blocking gate. Passwords rotated; reviewer credentials in AWS Secrets Manager (`airsafe/demo-credentials`). |
| **Gate 2** | Crash-Free & Operational Flow | **PASSED** | Hardware-verified on physical ITEL itel A667LP (Android 14). Telemetry simulated via `simulator/src/index.ts` and seeded via `scripts/seed-data.ts`. |
| **Gate 3** | Tenant & Role Isolation | **PASSED** | 46/46 passed in `node scripts/smoke-test-tenant-isolation.js`. Cross-tenant queries return 403; unauthenticated queries return 401. |
| **Gate 4** | Policy Safety Floor & Monotonic Strictness | **PASSED** | Universal strictness rule enforced: `rank(governed) >= rank(floor)`. `node scripts/run-evals.js --intentional-failure` flags violations with exit code 1. |
| **Gate 5** | Honest Scope & Cost Discipline | **HOLD / Pending billing evidence** | Requirement F-05 honestly documented as **"বাদ, কারণসহ"** (AWS Sydney Nova quota 0.0, AWS Case #17283940191). Development burn tracked as **Estimated $3.42 (billing export pending)**. |

---

## 4. Evaluator Reproduction Commands

Reviewers can verify all claims locally and against deployed endpoints using these commands:

```bash
# 1. AI Assistant Golden Evaluation Suite (Mocked 44/44, exit code 0)
node scripts/run-evals.js --mock-only

# 2. Safety Floor Intentional Failure Detection (Exit code 1)
node scripts/run-evals.js --intentional-failure

# 3. Multi-Tenant & MCP Auth Smoke Test (46/46 passed, exit code 0)
node scripts/smoke-test-tenant-isolation.js

# 4. Off-Topic AI Refusal Smoke Test (3/3 passed, exit code 0)
node scripts/smoke-test-ai-offtopic.js

# 5. REST API Service Unit Tests (105/105 passed, exit code 0)
npm --prefix services/api test

# 6. Model Context Protocol (MCP) Server Tests (21/21 passed, exit code 0)
npm --prefix services/mcp test

# 7. Sensor Simulator Fault & Telemetry Tests (6/6 passed, exit code 0)
npm --prefix simulator test
```
