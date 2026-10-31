# AirSafe Schools: Official Review & Evaluation Guide (REVIEW.md)
**Document Version:** 1.0.0  
**Date:** October 2026  
**Repository:** https://github.com/bdjewel27/airsafe-schools  
**Target Environment:** AWS Sydney (`ap-southeast-2`) & Native Android (API 26–35)  
**Evaluation Standard:** Model School Outdoor Activity Policy v1.2 & Project Specification  

---

## 1. Executive Summary & Honest Scope Disclosure

In accordance with project evaluation transparency requirements, this document outlines **what has been executed and verified** versus **what is simulated or excluded**:

| Component / Subsystem | Operational Reality | Evidence / Verification Method | Execution Command & Link |
| :--- | :--- | :--- | :--- |
| **AI Assistant Evals (A-9)** | **Mocked eval: 44/44 PASSED** | Executed via real endpoint handler `POST /schools/{id}/assistant/chat` with deterministic policy engine fallback. 0 safety violations. | Command: `node evals/run-evals.js --mock-only`<br>Report: [`docs/eval-report.md`](docs/eval-report.md) |
| **Live Bedrock Invocation** | **চালানো হয়নি (quota 0)** | Sydney (`ap-southeast-2`) Bedrock Nova on-demand quota is constrained to 0.0 tokens/min. Formally excluded under Hard Gate 5 as **"বাদ, কারণসহ"**. | AWS Support Case #17283940191<br>Rationale: [`docs/adr/001-bedrock-model-fallback.md`](docs/adr/001-bedrock-model-fallback.md) |
| **Live AI Off-Topic Refusal** | **3/3 PASSED (Live API)** | Deployed API Gateway strictly rejects off-topic queries in real time. | Command: `node scripts/smoke-test-ai-offtopic.js` |
| **Campus Sensors** | **কোনো physical sensor online নেই (Simulated/Seeded)** | Zero physical IoT hardware sensors are deployed on campus. All telemetry is generated via simulator and database seed. | Command: `node scripts/seed-data.ts`<br>Simulator: [`simulator/src/index.ts`](simulator/src/index.ts) |
| **Multi-Tenant & MCP Auth** | **45/45 PASSED (Live API)** | 12 tenant routes tested for 401 unauthenticated, 403 cross-tenant, 200 legitimate, SSE streams, and MCP auth. | Command: `node scripts/smoke-test-tenant-isolation.js` |
| **Physical Android Device** | **Hardware Verified (Zero Crashes)** | Tested on physical ITEL itel A667LP (Android 14, 720×1612 px, 3GB RAM). | Report: [`docs/device-test.md`](docs/device-test.md)<br>Screenshots: [`docs/real-phone-decision-card.png`](docs/real-phone-decision-card.png) |
| **Security & Secrets** | **Zero Secrets in Git History** | PBKDF2 passwords rotated. All reviewer credentials provisioned in AWS Secrets Manager (`airsafe/demo-credentials`). | Gitleaks: required CI gate<br>Workflows: [`.github/workflows/security.yml`](.github/workflows/security.yml), [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |

---

## 2. Hard Gates Verification Matrix

### Gate 1: Zero Secrets in Repository or History
- **Status:** **PASSED**
- **Verification:**
  - Ran `git-filter-repo` to purge all historical passwords across all 181 commits.
  - Gitleaks configured in [`.gitleaks.toml`](.gitleaks.toml) and enforced as a mandatory blocking prerequisite in [GitHub Actions CI](.github/workflows/ci.yml).
  - Reviewer and demo credentials are stored securely in AWS Secrets Manager under secret ID `airsafe/demo-credentials`:
    ```bash
    aws secretsmanager get-secret-value --secret-id airsafe/demo-credentials --query SecretString --output text
    ```

### Gate 2: Crash-Free & Operational Flow
- **Status:** **PASSED (Simulated / Seeded Telemetry)**
- **Verification:**
  - Backend API Gateway (`https://263c1j9hxk.execute-api.ap-southeast-2.amazonaws.com/dev`) responds within 200ms.
  - Signed release Android APK ([`android/app/build/outputs/apk/release/app-release.apk`](android/app/build/outputs/apk/release/app-release.apk)) runs crash-free on physical ITEL itel A667LP (Android 14).
  - Telemetry is simulated via [`simulator/src/index.ts`](simulator/src/index.ts) and seeded via [`scripts/seed-data.ts`](scripts/seed-data.ts). No physical IoT sensors are online.

### Gate 3: Tenant & Role Isolation
- **Status:** **PASSED**
- **Verification:**
  - All 12 tenant API routes strictly return HTTP 401 when called without a token, and HTTP 403 when called with a token from another school.
  - Teachers cannot record coordinator overrides or modify routines (HTTP 403).
  - Scoped MCP JWTs are context-driven and cannot access cross-tenant data.
  - Verification Command: `node scripts/smoke-test-tenant-isolation.js` (**45/45 PASSED**).

### Gate 4: Policy Safety Floor & Monotonic Strictness
- **Status:** **PASSED**
- **Verification:**
  - Authoritative EPA piecewise calculation implemented in [`services/api/src/policy.ts`](services/api/src/policy.ts) via `calculateAqiFromPm25`. For $PM_{2.5} = 49.7\,\mu\text{g/m}^3$, calculated AQI is strictly 136.
  - Universal strictness rank enforced: `rank(governed_decision) >= rank(expected_decision_floor)`.
  - Intentional Failure Verification: `node evals/run-evals.js --intentional-failure` flags safety floor violations and terminates with code 1.

### Gate 5: Honest Scope & Cost Discipline
- **Status:** **PASSED**
- **Verification:**
  - Requirement F-05 is honestly documented as **"বাদ, কারণসহ"** (Excluded with documented rationale: AWS Sydney Bedrock Nova quota 0.0, AWS Support Case #17283940191, ADR-001).
  - Total empirical development cloud cost tracked in [`docs/COST.md`](docs/COST.md) is **$3.42 USD**.

---

## 3. Physical Device Demonstration & Evidence Artifacts

Physical testing was conducted on an **ITEL itel A667LP** (Android 14, MediaTek Helio G25, 3GB RAM, 720x1612 px). All physical device screen captures and accessibility verification proofs are stored directly in the repository:

1. **Physical Device Captures & Accessibility Proofs:**
   - Action-First Decision Card: [`docs/real-phone-decision-card.png`](docs/real-phone-decision-card.png)
   - Bilingual Login Screen: [`docs/real-phone-app-home.png`](docs/real-phone-app-home.png)
   - Bangla Localized Decision Card: [`docs/screen_decision_bangla.png`](docs/screen_decision_bangla.png)
   - 200% Font Scale View: [`docs/screen_decision_font200.png`](docs/screen_decision_font200.png)
   - TalkBack Accessibility Navigation: [`docs/screen_decision_talkback.png`](docs/screen_decision_talkback.png)

---

## 4. Reviewer Reproduction Commands

The reviewer can reproduce every test and verification claim using these commands:

```bash
# 1. Run AI Assistant Evaluation Suite (Mocked 44/44)
node evals/run-evals.js --mock-only

# 2. Verify Intentional Failure Detection (Must fail with exit code 1)
node evals/run-evals.js --intentional-failure

# 3. Run Live Multi-Tenant & MCP Auth Smoke Test (45/45 live checks)
node scripts/smoke-test-tenant-isolation.js

# 4. Run Live Off-Topic AI Refusal Smoke Test (3/3 live refusals)
node scripts/smoke-test-ai-offtopic.js

# 5. Run API Unit Tests (104/104 passed)
npm --prefix services/api test

# 6. Run MCP Server Tests (21/21 passed)
npm --prefix services/mcp test

# 7. Run Sensor Simulator Fault Tests (6/6 passed)
npm --prefix simulator test
```
