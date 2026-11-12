# AirSafe Schools (à¦à¦¯à¦¼à¦¾à¦°à¦¸à§‡à¦« à¦¸à§à¦•à§à¦²à¦¸) ðŸ«ðŸ’¨
**Smart, Policy-Bounded Environmental Decision Support & AI Assistant for Schools in Bangladesh**

[![Android Build](https://img.shields.io/badge/Android-Kotlin%20%7C%20Signed%20Release-green)](android/)
[![Backend](https://img.shields.io/badge/AWS-Serverless%20%7C%20Sydney%20ap--southeast--2-orange)](infra/)
[![AI Engine](https://img.shields.io/badge/AI-Bedrock%20Architecture%20%7C%20Grounded%20Citations-blue)](services/mcp/)
[![Evaluations](https://img.shields.io/badge/A--9%20Eval%20Golden%20Set-100%25%20Rule%20Adherence%20(40%2F40)-brightgreen)](docs/eval-report.md)
[![Cost Guardrails](https://img.shields.io/badge/AWS%20Projected%20Monthly-%245.28%20%2F%20100%20Schools-success)](docs/COST.md)
[![Security Gates](https://img.shields.io/badge/Hard%20Gates-All%205%20PASS%20(100%25)-success)](STATUS.md)

---

## 1. Project Overview

During Bangladesh's scorching heatwaves and Dhaka's hazardous air pollution crises, teachers and school coordinators face a critical daily question: **"Is it safe for our children to hold assembly, PE, or play outdoors right now?"**

**AirSafe Schools** provides an ultra-responsive, policy-grounded mobile decision engine backed by a resilient AWS serverless cloud infrastructure:
- â±ï¸ **Sub-2-Second Decisions:** Instant traffic-light guidance (**SAFE / CAUTION / MOVE INDOORS**) tailored to Bangladesh environmental thresholds.
- ðŸ›¡ï¸ **Monotonic Safety Floor:** AI discretion and coordinator overrides can only tighten outdoor safety restrictionsâ€”never soften them below official *Model School Outdoor Activity Policy v1.2*.
- ðŸ“¡ **Automated Danger Alerts:** High-priority heads-up notifications trigger automatically when campus conditions breach safety limits ($AQI \ge 175$ or $HeatIndex \ge 44^\circ\text{C}$).
- ðŸ“´ **Zero-Lag Offline Resilience:** Automatic network transition detection via Android `ConnectivityManager` with cached snapshots and high-contrast warning banners.
- ðŸ¤– **Bilingual Grounded AI Assistant:** Grounded reasoning engine with campus sensor grounding, guardrails, and interactive citations to *Model School Outdoor Activity Policy v1.2* (F-05).
- ðŸ’° **Grounded Serverless Cost Architecture:** 100% serverless AWS backend strictly capped under the $100 credit limit with metric-based projected cost of **$5.28/month for 100 schools** ($3.42 actual burn to date per `docs/COST.md`).

---

## 2. Environment Configuration & Authentication (Invite-Only)

AirSafe Schools operates an invite-only model (Policy S-2) where staff accounts are provisioned via AWS Cognito with cryptographically scoped permissions:

- **Authentication Protocol:** Staff authenticate against AWS Cognito SRP endpoints. Tokens contain immutable claims (`custom:school_id`, `role`, and expiration).
- **Tenant Isolation:** Every request is cryptographically scoped to the caller's school tenant (`custom:school_id`). Cross-school queries are rejected at API and MCP layers.
- **Reviewer & Evaluation Credentials:** Evaluator accounts (School A teacher, School B teacher, School Coordinator) are delivered securely via out-of-band communication (never committed in plaintext to version control).
- **Secrets Management:** External API keys and MCP HMAC secrets are externalized in AWS SSM Parameter Store as `SecureString` types.

---

## 3. System Architecture

```mermaid
flowchart TD
    subgraph DataSources["External Data Feeds & Sensors"]
        direction TB
        OpenAQ["OpenAQ API (Ground Sensors)"]
        OpenMeteo["Open-Meteo API (Modeled Weather)"]
        Simulator["Virtual School Sensor Simulator (Load Test 200 ev/s)"]
    end

    subgraph AWSCloud["AWS Serverless Backend (Sydney ap-southeast-2)"]
        direction TB
        SQS["SQS Ingestion Buffer (airsafe-ingestion-queue-dev)"]
        DLQ["Dead Letter Queue (airsafe-ingestion-dlq-dev)"]
        SQSLambda["SQS Processor Lambda (Batch 10, Partial Failures)"]
        PollerLambda["Poller Lambda (Scheduled External Ingestion)"]
        DDB[("DynamoDB: AirSafe-Readings-dev (On-Demand, 30-Day TTL)")]
        APIGW["API Gateway (HTTP REST with Cognito Authorizer)"]
        APILambda["API Lambda (Latest Decision Handler)"]
        ChatLambda["Chat Lambda (Bedrock ConverseStream)"]
        MCPServer["MCP Server Lambda (Read-Only Tool Grounding F-22)"]
        SSM["AWS SSM Parameter Store (SecureString Secrets)"]
        Cognito["Amazon Cognito (Invite-Only User Pool)"]
    end

    subgraph AndroidClient["Android Client (Kotlin + Jetpack Compose)"]
        direction TB
        DecisionCard["2-Second Decision Card (Safe/Caution/Danger)"]
        AIAssistant["Grounded AI Assistant (Thinking Steps & Citations)"]
        ConnMgr["ConnectivityManager (Auto Offline Detection)"]
        NotifHelper["AirSafeNotificationHelper (Auto Danger Push Alerts)"]
        Analytics["Weekly Analytics & Android Share Sheet"]
    end

    Simulator -->|200+ ev/s Ingestion| SQS
    OpenAQ & OpenMeteo --> PollerLambda
    SQS -->|Batch Processing| SQSLambda
    SQS -.->|Poisoned Payloads (maxReceive: 3)| DLQ
    SQSLambda -->|Validated Ingestion| DDB
    PollerLambda -->|Save Evaluation| DDB
    SSM -.->|Decrypt Secrets| PollerLambda & ChatLambda & MCPServer
    APIGW --> APILambda
    APIGW --> ChatLambda
    ChatLambda -->|HMAC-SHA256 Token (<= 5 min)| MCPServer
    DDB --> APILambda
    DDB --> MCPServer
    APILambda -->|JSON Decision| DecisionCard
    Cognito -->|JWT Claims| AndroidClient
    ConnMgr --> DecisionCard
    NotifHelper --> DecisionCard
```

---

## 4. Runbook: How to Build & Verify Everything

### Step 1: Signed Release APK Installation
The cryptographically signed release APK is pre-built and verified:
- **Signed APK Location:** `android/app/build/outputs/apk/release/app-release.apk`
- **Keystore:** `android/app/airsafe-release.jks`

To compile from source and install onto a connected physical device or emulator:
```powershell
$env:JAVA_HOME = "E:\AndroidStudio\jbr"
cd android
.\gradlew.bat assembleRelease

# Install directly to device
adb install -r app/build/outputs/apk/release/app-release.apk
```

---

### Step 2: Run Automated Test Suites (All Suites Green)

**A. Deterministic Policy Engine & Property Tests (`services/poller`):**
Validates the mathematical rule engine across **1,500+ generated environmental scenarios** (monotonicity, conservative floor, modeled/stale caps, and extreme hazard safety):
```powershell
cd services/poller
npm test
```
*Result: `30 passed, 30 total`*

**B. REST API, Tenant Isolation & RBAC Tests (`services/api`):**
Validates Hard Gate 2 cryptographic tenant isolation, Hard Gate 3 server-controlled role gating, and Hard Gate 4 fail-closed UNKNOWN fallback:
```powershell
cd services/api
npm test
```
*Result: `22 passed, 22 total`*

**C. Read-Only MCP Server Tests (`services/mcp` - F-22):**
Validates fail-closed JSON-RPC 2.0 tool execution, short-lived HMAC-SHA256 bearer verification, and absence of school_id leaks:
```powershell
cd services/mcp
npm test
```
*Result: `16 passed, 16 total`*

**D. Simulator & Ingestion SQS/DLQ Load Tests (`simulator`):**
Validates 200 ev/s burst throughput and dead letter queue isolation:
```powershell
cd simulator
npm test
npx ts-node src/loadTest.ts
```
*Result: `8 passed, 8 total` (316.8 events/sec empirical throughput)*

**E. Android Unit & Authoritative Floor Tests (`android`):**
Validates client-side authoritative floor clamping and offline cache logic:
```powershell
cd android
.\gradlew.bat testDebugUnitTest
```
*Result: `10 passed, 10 total`*

---

### Step 3: Run AI Golden Set Evaluations (A-9 Specification)
Executes the evaluation runner against the 40 golden questions covering Appendix C:
```powershell
node evals/run-evals.js
```
**Evaluation Metrics:**
- **Pass Rate:** **100.0%** (40/40)
- **Safety Floor Violations:** **0** (100% strict adherence)
- **Out-of-Scope Refusal Precision:** **100.0%** (8/8)
- **Policy Citation Precision:** **100.0%** (32/32)
- Generated report: [`docs/eval-report.md`](docs/eval-report.md)

---

### Step 4: Verify AWS Serverless Deployments
```powershell
cd infra
npx cdk diff
```

---

### Step 5: Release APK Distribution & Verification (Section 14 Deliverables)

Per Git repository best practices and **Hard Gate 1**, compiled binary artifacts (`*.apk`) are git-ignored to prevent repository bloat and binary tampering. Evaluators can obtain and verify the signed release APK via two verified channels:

- **Option A (Official GitHub Release â€” Recommended):**  
  Download the pre-compiled, cryptographically signed APK attached to the official GitHub Release `v1.0.0`:  
  ðŸ”— [GitHub Releases: AirSafe Schools v1.0.0 (app-release.apk)](https://github.com/bdjewel27/airsafe-schools/releases/tag/v1.0.0)

- **Option B (Compile from Source with Fail-Closed Keystore):**  
  To compile and sign the release artifact locally:
  ```powershell
  cd android
  $env:AIRSAFE_KEYSTORE_PASSWORD="<reviewer-keystore-password>"
  $env:AIRSAFE_KEY_PASSWORD="<reviewer-keystore-password>"
  .\gradlew.bat assembleRelease
  ```
  *Output Binary:* `android/app/build/outputs/apk/release/app-release.apk`  
  *Signature:* SHA-256 with RSA 2048-bit key (`airsafe-release.jks`), APK Signature Scheme v1 & v2 enabled.

---

## 5. Physical Device Test Journeys (Section 12: J-1 to J-4)

Detailed test data and device instrumentation logs are available in [`docs/device-test.md`](docs/device-test.md):

| Journey ID | Focus Area (Section 02) | Benchmark Requirement | Empirical Physical Result | Status |
| :---: | :--- | :--- | :---: | :---: |
| **J-1** | **à¦¸à¦•à¦¾à¦²à§‡à¦° à¦šà§‡à¦• (à§§à§¦ à¦¸à§‡à¦•à§‡à¦¨à§à¦¡à§‡à¦° à¦•à¦®, à¦¸à¦°à§à¦¬à§‹à¦šà§à¦š à§© à¦Ÿà§à¦¯à¦¾à¦ª)**<br>(Morning Check: $\le 10\text{s}$, $\le 3\text{ taps}$) | Decision glance $< 10\text{ s}$, $\le 3\text{ taps}$, card paint $< 2.0\text{ s}$ | **2.8 s glance** (Card paint: 790ms) | âœ… PASS |
| **J-2** | **à¦¬à¦¾à¦‚à¦²à¦¾à¦¯à¦¼ à¦ªà§à¦°à¦¶à§à¦¨ à¦“ AI à¦‰à¦¤à§à¦¤à¦° (à¦¸à§à¦Ÿà§à¦°à¦¿à¦®à¦¿à¦‚ + à¦¸à¦¾à¦‡à¦Ÿà§‡à¦¶à¦¨)**<br>(Bengali Inquiry & AI Response: Streaming + Citation) | Bilingual response, grounded in telemetry, Policy v1.2 citation | **100% Grounded** (Zero safety floor breaches) | âœ… PASS |
| **J-3** | **à¦¸à¦¿à¦¦à§à¦§à¦¾à¦¨à§à¦¤ à¦–à¦¾à¦°à¦¾à¦ª à¦¹à¦“à§Ÿà¦¾à¦° à¦ªà§à¦¶ à¦¸à¦¤à¦°à§à¦•à¦¬à¦¾à¦°à§à¦¤à¦¾ à¦“ à¦•à§‹à¦…à¦°à§à¦¡à¦¿à¦¨à§‡à¦Ÿà¦° à¦“à¦­à¦¾à¦°à¦°à¦¾à¦‡à¦¡**<br>(Deterioration Push Alert & Coordinator Override) | Heads-up push upon Danger entry; tighten-only coordinator override | **Verified on Hardware** (Audited immutable log) | âœ… PASS |
| **J-4** | **à¦¶à§à¦•à§à¦°à¦¬à¦¾à¦°à§‡à¦° à¦¸à¦¾à¦ªà§à¦¤à¦¾à¦¹à¦¿à¦• à¦ªà¦°à§à¦¯à¦¾à¦²à§‹à¦šà¦¨à¦¾ à¦“ à¦°à¦¿à¦ªà§‹à¦°à§à¦Ÿ à¦à¦•à§à¦¸à¦ªà§‹à¦°à§à¦Ÿ**<br>(Friday Weekly Safety Review & Report Export) | Weekly lost minutes, metrics breakdown, native Android Share Sheet | **Verified on Hardware** (Stable 44MB heap) | âœ… PASS |

---

## 6. Project Directory Map

```text
airsafe-schools/
â”œâ”€â”€ android/                           # Native Android Jetpack Compose Application
â”‚   â””â”€â”€ app/src/main/java/com/airsafe/schools/
â”‚       â”œâ”€â”€ MainActivity.kt            # Entry activity & navigation scaffold
â”‚       â”œâ”€â”€ data/                      # Retrofit client, models, notification helper
â”‚       â””â”€â”€ ui/
â”‚           â”œâ”€â”€ screens/               # DecisionCard, Assistant, Trends, Analytics, Staff
â”‚           â”œâ”€â”€ theme/                 # High-contrast color palette (WCAG AAA)
â”‚           â””â”€â”€ viewmodel/             # DecisionViewModel (diurnal engine & network listener)
â”œâ”€â”€ docs/                              # Architecture, Cost, and Verification Reports
â”‚   â”œâ”€â”€ adr/                           # Architecture Decision Records (ADR 001 to 012)
â”‚   â”œâ”€â”€ ai-usage-log.md                # Human-audited AI usage & error log (Section 11, 14, 16)
â”‚   â”œâ”€â”€ COST.md                        # Metric-grounded AWS cost model (Sydney rates)
â”‚   â”œâ”€â”€ day1-checks.md                 # Day 1 baseline capability & API response checks
â”‚   â”œâ”€â”€ device-test.md                 # Physical device verification report (J-1 to J-4)
â”‚   â”œâ”€â”€ eval-report.md                 # AI assistant golden set evaluation report
â”‚   â”œâ”€â”€ ingestion-load-test-report.md  # 200 ev/s SQS/DLQ burst load test report
â”‚   â”œâ”€â”€ status/                        # Weekly Friday status reports (week-1.md to week-4.md)
â”‚   â”œâ”€â”€ threat-model.md                # Comprehensive STRIDE threat model & Dependabot
â”‚   â””â”€â”€ ux-decisions.md                # Top 5 UX Decisions, wireframes & high-fi screens
â”œâ”€â”€ evals/                             # Golden Dataset & Evaluation Runner (A-9)
â”‚   â”œâ”€â”€ eval-dataset.json              # 40 golden questions (Appendix C coverage)
â”‚   â””â”€â”€ run-evals.js                   # Automated evaluation test runner
â”œâ”€â”€ infra/                             # AWS CDK Infrastructure as Code (Sydney ap-southeast-2)
â”‚   â”œâ”€â”€ bin/infra.ts                   # CDK App entry point
â”‚   â””â”€â”€ lib/                           # AuthStack, StorageStack, ApiStack, IngestionStack
â”œâ”€â”€ loadtest/                          # Automated Ingestion Pipeline Load & Burst Tests
â”‚   â”œâ”€â”€ k6-loadtest.js                 # k6 load testing script (200 ev/s sustained + 500 burst)
â”‚   â”œâ”€â”€ artillery-loadtest.yml         # Artillery load testing configuration
â”‚   â””â”€â”€ results/                       # Empirical raw test benchmarks (JSON/CSV)
â”œâ”€â”€ mcp/                               # Root Model Context Protocol (MCP) Server & Tool Library
â”‚   â”œâ”€â”€ src/tools.ts                   # Shared tool schemas (get_school_decision, sensor readings, policy)
â”‚   â”œâ”€â”€ src/index.ts                   # Hardened JSON-RPC 2.0 server & HMAC tenant scoping
â”‚   â””â”€â”€ src/policy/v1.2.json           # Policy v1.2 threshold config
â”œâ”€â”€ services/
â”‚   â”œâ”€â”€ api/                           # Lambda REST API Handler (Node.js/TS, Bedrock, Auth)
â”‚   â”œâ”€â”€ mcp/                           # Lambda MCP Server adapter
â”‚   â””â”€â”€ poller/                        # Scheduled Multi-Sensor Ingestion & Policy Engine
â”‚       â””â”€â”€ src/__tests__/             # Policy unit tests & A-2 property tests
â”œâ”€â”€ simulator/                         # Virtual school diurnal load generator & load test
â”œâ”€â”€ scripts/                           # Day-1 checks, JWT rotation & release build helpers
â”œâ”€â”€ README.md                          # Master documentation & replication runbook
â”œâ”€â”€ RUNBOOK.md                         # Dedicated evaluator runbook & emergency procedures
â””â”€â”€ STATUS.md                          # Comprehensive feature status matrix
```

---

## 7. Cost & Budget Assurance ($100 Limit)

Per Section 9 of Project Brief v2.0 and **ADR 012**, the architecture operates within verified metric-based cost boundaries:
- **DynamoDB:** Provisioned in `PAY_PER_REQUEST` (On-Demand) mode with an automated 30-day TTL.
- **AWS Lambda:** Invoked exclusively on-demand or by scheduled EventBridge rule (within 1,000,000 free tier requests/month).
- **Amazon Bedrock:** Zero standing provisioned throughput; all embeddings and inference operate on serverless consumption.
- **Projected Cost:** **$5.28/month for 100 schools** based on published AWS Sydney (`ap-southeast-2`) rates ($3.42 actual burn to date).
- **Detailed breakdown:** See [`docs/COST.md`](docs/COST.md).

---

## 8. Deliverables & Submissions Compliance Matrix (Section 14)

| Deliverable (Section 14) | Required Format | Repository Location & Evidence | Status |
| :--- | :--- | :--- | :---: |
| **Wireframes, Storyboards, High-Fi Screens, UX Notes** | Figma or `docs/` images | [`docs/ux-decisions.md`](docs/ux-decisions.md) + 5 high-fidelity physical device screenshots | âœ… **Ready** |
| **ADR ($\ge 7$), Threat Model, Runbook** | Markdown in `docs/` | [`docs/adr/`](docs/adr/) (12 ADRs), [`docs/threat-model.md`](docs/threat-model.md), [`RUNBOOK.md`](RUNBOOK.md) | âœ… **Ready** |
| **Weekly Status & COST.md** | `docs/status/`, `docs/COST.md` | [`docs/status/`](docs/status/) (`week-1.md` to `week-4.md`), [`docs/COST.md`](docs/COST.md) | âœ… **Ready** |
| **Reviewer Installable App** | Signed Release APK | [GitHub Releases v1.0.0](https://github.com/bdjewel27/airsafe-schools/releases) & [`scripts/build-release.ps1`](scripts/build-release.ps1) | âœ… **Ready** |
| **Phone Test Report & Video Recording** | `docs/device-test.md` + Video | [`docs/device-test.md`](docs/device-test.md) (ITEL itel A667LP test report) | âœ… **Ready** |
| **AI Evaluation Report** | Markdown with raw scores & citations | [`docs/eval-report.md`](docs/eval-report.md) (40/40 Golden Set, 100% Pass Rate) | âœ… **Ready** |
| **Load Test Report** | Scripts, raw outputs & summary | [`loadtest/`](loadtest/) (k6, Artillery, raw JSON/CSV, [`docs/ingestion-load-test-report.md`](docs/ingestion-load-test-report.md)) | âœ… **Ready** |
| **Accessibility Evidence** | TalkBack audit, contrast ratios, Bengali UI | [`docs/device-test.md`](docs/device-test.md#b-talkback-u-6-accessibility--contrast-audit) & [`docs/ux-decisions.md`](docs/ux-decisions.md#7-accessibility-contrast--200-font-zoom-verification-u-6) | âœ… **Ready** |
| **AI Usage Log** | AI use cases, human audit & verification | [`docs/ai-usage-log.md`](docs/ai-usage-log.md) (Claude, Gemini, Bedrock oversight log) | âœ… **Ready** |
| **Evaluator Review Guide** | Complete endpoint spec, health route & auth matrix | [`PROJECT_REVIEW_FOR_CLAUDE.md`](PROJECT_REVIEW_FOR_CLAUDE.md) | âœ… **Ready** |
| **Demo Walkthrough Video (8-10 min)** | External Video (J-1 to J-4 on phone) | Provided via YouTube / Drive link in submission form & [`docs/device-test.md`](docs/device-test.md#8-video-recordings--demonstration-artifacts-à¦­à¦¿à¦¡à¦¿à¦“-à¦“-à¦¡à§‡à¦®à§‹-à¦²à¦¿à¦™à§à¦•) | ðŸŽ¬ **User Upload** |
| **Reviewer Login Credentials** | 3 Isolated Tenants / Roles (Never in git) | Stored in AWS Secrets Manager (`airsafe/demo-credentials`); see [`RUNBOOK.md`](RUNBOOK.md#2-reviewer-account-provisioning-out-of-band-delivery) | âœ… **Ready** |

