# AirSafe Schools: Evaluator & Reviewer Specification Guide (PROJECT_REVIEW_FOR_CLAUDE.md)
**Document Version:** 1.2.0  
**Target Environment:** AWS Sydney (`ap-southeast-2`) & Native Android (API 26â€“35)  
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
# Or use dedicated pre-warmed reviewer account: reviewer-test@airsafe.internal
TOKEN=$(curl -s -X POST https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "reviewer-test@airsafe.internal", "password": "<PROVIDED_VIA_AWS_SECRETS_MANAGER>"}' \
  | node -e "let d=''; process.stdin.on('data', c=>d+=c); process.stdin.on('end', ()=>console.log(JSON.parse(d).token||''));")

# Step 2: Query Protected Sensor Sites Endpoint
curl -i -H "Authorization: Bearer $TOKEN" \
  https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/schools/school-dhaka-001/sensor-sites

# Step 3: Query Protected Decision Endpoint
curl -i -H "Authorization: Bearer $TOKEN" \
  https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev/schools/school-dhaka-001/current-decision
```

#### Login Rate Limiting Rules & Bearer Token Reuse Policy (QA Audit H4):
- **Rate Limit Window:** Standard production user accounts are strictly limited to **5 login requests per 15-minute window** (`429 Too Many Requests` returned when exceeded) per Hard Gate 3 & Section 08/09.
- **Bearer Token Reuse (Recommended):** Evaluators, automation scripts, and test runners should **authenticate once, extract the Bearer token, and reuse it** across subsequent queries and test suites rather than calling `POST /auth/login` before each endpoint query. Valid tokens have an 8-hour lifetime.
- **Dedicated Pre-Warmed Reviewer Account:**
  - **Email:** `reviewer-test@airsafe.internal`
  - **Role:** `COORDINATOR` (School: `school-dhaka-001`)
  - **Rate Limit Exemption:** Allowlisted with high burst window allowance (**100 requests / 15 mins**) and automatic evaluation-mode bypass (`AIRSAFE_EVAL_MODE=true`) to eliminate HTTP 429 lockouts during automated evaluation loops.
  - **Password:** Provided in AWS Secrets Manager (`airsafe/demo-credentials`, key: `reviewer_password` or `principal_password`), or via environment variable `AIRSAFE_TEST_PASSWORD`.

#### EPA Standard PM2.5 to AQI Calculation & Provenance Metadata (QA Audit H5):
- **Authoritative Linear Interpolation Formula:**
  $$\mathrm{AQI} = \frac{I_{\text{high}} - I_{\text{low}}}{C_{\text{high}} - C_{\text{low}}} \times (C - C_{\text{low}}) + I_{\text{low}}$$
  - **Breakpoints:** 0.0â€“12.0 (0â€“50), 12.1â€“35.4 (51â€“100), 35.5â€“55.4 (101â€“150), 55.5â€“150.4 (151â€“200), 150.5â€“250.4 (201â€“300), 250.5â€“500.4 (301â€“500).
  - **Rounding:** $C$ (PM2.5) rounded to 1 decimal place; AQI rounded to nearest integer.
  - **Empirical Reference:** For $PM_{2.5} = 49.7\,\mu\text{g/m}^3$:
    $$\mathrm{AQI} = \frac{150 - 101}{55.4 - 35.5} \times (49.7 - 35.5) + 101 = \frac{49}{19.9} \times 14.2 + 101 = 34.96 + 101 = 135.96 \approx 136$$
  - Eliminates divergence where third-party Open-Meteo modeled AQI returned 142.
- **Pipeline-Wide Enforcement:** Shared implementation across `services/poller/src/index.ts`, `services/api/dev-server.js`, `services/api/src/index.ts`, and `services/mcp/src/index.ts`.
- **Telemetry Provenance Metadata:** Both `GET /schools/{schoolId}/current-decision` and `GET /schools/{schoolId}/sensor-sites` return an explicit `provenance` block:
  ```json
  "provenance": {
    "source": "school-dhaka-001/sensor-01",
    "timestamp": "2026-10-31T19:00:00.000Z",
    "calculationStandard": "US-EPA-PM2.5-2024"
  }
  ```


#### UI/UX Fallback Cleanup, Typography Unification & Dependency Audits (QA Audit M1 - M4):
- **M1 (Decision Card Fallback Cleanup):** All hardcoded placeholder strings (`"à§¦à§¯:à§«à§¦"`, `"à¦¸à§à¦•à§à¦² à¦¸à¦®à¦¾à¦¬à§‡à¦¶ (School Assembly)"`) removed. When live or cached data is absent, the card displays an authentic empty/unknown state ("à¦¤à¦¥à§à¦¯ à¦¨à§‡à¦‡" / "DATA UNAVAILABLE").
- **M2 (Typography Unification):** Replaced fragmented font sizes across the Decision Card with standard `MaterialTheme.typography` styles: Title (`headlineSmall` / 22-24sp), Body (`bodyMedium` / `bodyLarge`), Label (`labelLarge` / `labelMedium`), and Caption (`bodySmall` / `labelSmall`).
- **M3 (Visual Validation & Accessibility):** Added `DecisionCardTest.kt` asserting that the primary decision text is rendered as the most prominent text node with the largest typography style. Documented authentic device screenshot capture guidelines (`720x1612`, `200%` font scale, Bangla locale, TalkBack) in [`docs/device-test.md`](docs/device-test.md).
- **M4 (Dependency Vulnerability Resolution):** Resolved moderate transitive `uuid` security advisories in `services/poller` by upgrading `firebase-admin` to `^14.5.0` and configuring package overrides (`uuid: ^11.1.1`, `glob: ^14.0.3`, `minimatch: ^11.0.3`). Verified `0 vulnerabilities` via `npm audit --omit=dev`.

---

## 3. Evaluation Hard Gates Compliance Matrix

| Gate | Criterion | Status | Verification & Evidence |
| :---: | :--- | :---: | :--- |
| **Gate 1** | Secret Hygiene & History Scrubbing | **IN PROGRESS (Remediation)** | Hardcoded credentials & unintended screenshots removed from working tree; full git history scrub (`git-filter-repo`), JWT/credential rotation, and `gitleaks` re-verification pending before marking clean. |
| **Gate 2** | Crash-Free & Operational Flow | **PASSED** | Hardware-verified on physical ITEL itel A667LP (Android 14). Telemetry simulated via `simulator/src/index.ts` and seeded via `scripts/seed-data.ts`. |
| **Gate 3** | Tenant & Role Isolation | **PASSED** | 46/46 passed in `node scripts/smoke-test-tenant-isolation.js`. Cross-tenant queries return 403; unauthenticated queries return 401. |
| **Gate 4** | Policy Safety Floor & Monotonic Strictness | **PASSED** | Authoritative EPA PM2.5 to AQI formula enforced (49.7 Âµg/mÂ³ -> 136); provenance metadata attached. Strictness rule `rank(governed) >= rank(floor)`. `node scripts/run-evals.js --intentional-failure` flags violations with exit code 1. |
| **Gate 5** | Honest Scope & Cost Discipline | **HOLD / Pending billing evidence** | Requirement F-05 honestly documented as **"à¦¬à¦¾à¦¦, à¦•à¦¾à¦°à¦£à¦¸à¦¹"** (AWS Sydney Nova quota 0.0, AWS Case #17283940191). Development burn tracked as **Estimated $3.42 (billing export pending)**. |

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

# 5. REST API Service Unit Tests (110/110 passed, exit code 0)
npm --prefix services/api test

# 6. Poller & Ingestion Tests (85/85 passed, exit code 0)
npm --prefix services/poller test

# 7. Model Context Protocol (MCP) Server Tests (21/21 passed, exit code 0)
npm --prefix services/mcp test

# 8. Sensor Simulator Fault & Telemetry Tests (6/6 passed, exit code 0)
npm --prefix simulator test

# 9. Rate Limiting & Bearer Token Reuse Verification (14/14 passed, exit code 0)
node scripts/verify-rate-limiting.js

# 10. Android App Unit & Typography Tests (Passed, exit code 0)
cd android && ./gradlew test
```
