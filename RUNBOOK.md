# AirSafe Schools — Evaluator & Reviewer Runbook

This runbook provides complete, step-by-step instructions to replicate, build, test, and verify the entire **AirSafe Schools** ecosystem across cloud backend, automated test suites, physical mobile hardware, and security compliance gates.

---

## 1. Quick Verification Commands Summary

Run these commands in their respective directories to verify the complete verification matrix:

| Verification Target | Directory | Command | Verified Outcome |
| :--- | :--- | :--- | :--- |
| **Deterministic Policy & Property Tests (A-2)** | `services/poller` | `npm test` | **30 passed** (1,500+ generated scenarios) |
| **REST API, Multi-Tenant & RBAC Tests** | `services/api` | `npm test` | **22 passed** (Gates 2, 3, 4 fully verified) |
| **Model Context Protocol Server (F-22)** | `services/mcp` | `npm test` | **16 passed** (JSON-RPC 2.0, HMAC scoping) |
| **Ingestion SQS/DLQ Load Test (200 ev/s)** | `simulator` | `npm test` | **8 passed** (316.8 ev/s empirical throughput) |
| **Android Unit & Policy Engine Tests** | `android` | `.\gradlew.bat testDebugUnitTest` | **10 passed** (Authoritative floor & cache) |
| **AI Golden Set Evals (A-9 Specification)** | Project Root | `node evals/run-evals.js` | **100% Pass** (40/40 queries, 0 violations) |
| **Android Assemble Signed Release APK** | `android` | `.\gradlew.bat assembleRelease` | **BUILD SUCCESSFUL** (`app-release.apk`) |
| **AWS CDK Infrastructure Diff** | `infra` | `npx cdk diff` | In-sync serverless stacks (Auth, Storage, Api, Ingestion) |

---

## 2. Reviewer Account Provisioning (Out-of-Band Delivery)

To comply strictly with **Hard Gate 1 (Security & Secret Sanitization)**, no plaintext passwords or live JWT secrets are committed to the public Git repository. 

Three dedicated evaluation accounts representing isolated tenants and roles have been provisioned in the Cognito User Pool:

| Account Identifier | Role | Tenant School | Purpose & Evaluation Coverage |
| :--- | :--- | :--- | :--- |
| **School A Teacher** | `teacher` | `school-dhaka-001`<br>*(Dhaka Model School)* | Verify teacher view, PE routine notes (F-08), AI Assistant query (F-05). Verify rejection if attempting coordinator override (RBAC Gate 3). |
| **School B Teacher** | `teacher` | `school-chittagong-002`<br>*(Chittagong High School)* | Verify strict multi-tenant isolation (Gate 2): Cannot view or query School A's data, context notes, or routines. |
| **School Coordinator** | `coordinator` | `school-dhaka-001`<br>*(Dhaka Model School)* | Full administrative capabilities: Read decision card, submit mandatory-justification activity override (F-11), invite new staff (F-12), export weekly analytics report (F-13, F-14). |

> [!IMPORTANT]
> **Out-of-Band Credentials Delivery:** The passwords and active test tokens for the 3 accounts above are transmitted directly to the evaluation committee via private submission message / secure channel. To execute API requests locally with custom credentials, set the shell environment variables:
> ```powershell
> $env:COGNITO_USER_TEACHER_A="fatema.teacher@dms.edu.bd"
> $env:COGNITO_USER_TEACHER_B="nusrat.teacher@chs.edu.bd"
> $env:COGNITO_USER_COORDINATOR="rafiq.principal@dms.edu.bd"
> ```

---

## 3. Signed Release APK Build & Physical Device Testing

### Pre-requisites:
- Java JDK 17+ (or Android Studio JBR: `E:\AndroidStudio\jbr`).
- Android 8.0+ physical device (USB debugging enabled) or Android Virtual Device (API 26–35).

### Option A: Install Pre-Built Signed Release APK
The cryptographically signed release APK is located at:
`android/app/build/outputs/apk/release/app-release.apk`

Install directly to an adb-connected device:
```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

### Option B: Compile Signed Release APK from Source
```powershell
$env:JAVA_HOME = "E:\AndroidStudio\jbr"
cd android
.\gradlew.bat assembleRelease
```
*Artifact generated: `android/app/build/outputs/apk/release/app-release.apk` (Signed with `airsafe-release.jks`).*

---

## 4. Replicating the 4 Mandatory Physical Journeys (Section 12)

### J-1: Cold Start Under 2 Seconds
1. Force-stop the application on the device: `adb shell am force-stop com.airsafe.schools`.
2. Launch from cold state: `adb shell am start -W -n com.airsafe.schools/.MainActivity`.
3. **Verification:** The traffic-light decision card paints from cache in **< 0.8 seconds** (measured: 684ms display, 790ms paint).

### J-2: Automatic Offline Detection & Resilience
1. With the app running, toggle **Airplane Mode** on the device.
2. **Verification:**
   - Android's `ConnectivityManager` immediately signals connection loss.
   - High-contrast warning banner displays: *"অফলাইন মোড: ক্যাশ করা ডেটা দেখানো হচ্ছে"* (Offline Mode: Showing cached snapshot).
   - Card badges transition to `"অফলাইন • ক্যাশে সংরক্ষিত"`.
   - The app does NOT crash, freeze, or display a blank screen.
3. Turn off Airplane Mode: The app automatically reconnects and resumes live synchronization.

### J-3: Automated Danger Transition Alert & Accessibility (U-6)
1. Simulate high-heat or extreme smog ($AQI \ge 175$, $HeatIndex \ge 44^\circ\text{C}$).
2. **Verification:**
   - Heads-up push notification appears immediately (`IMPORTANCE_HIGH`) with title: *"🚨 AirSafe জরুরি সতর্কতা: MOVE INDOORS"*.
   - Tapping notification navigates directly to the current campus decision card.
3. Enable Android **TalkBack** screen reader:
   - Verify all interactive controls have descriptive bilingual labels.
   - Verify touch targets meet or exceed **$48\times 48\text{ dp}$**.
   - Verify text contrast meets WCAG AAA standards ($\ge 7:1$).

### J-4: Memory Leak & Long-Running Stability
1. Leave the app running on the live Decision Card screen for 35 minutes with the diurnal simulation cycling every 12 seconds.
2. **Verification:**
   - Inspect Android Studio Profiler: Heap allocation stabilizes at **~44 MB** with zero runaway growth or ANR events.

---

## 5. Ingestion SQS/DLQ Load Test Replication

To run the automated 200 events/sec burst load test against the ingestion pipeline:
```powershell
cd simulator
npx ts-node src/loadTest.ts
```
**Empirical Results:**
- **Sustained Throughput:** 316.8 events/sec (exceeds 200 ev/s target).
- **Average Processing Latency:** 1.38 ms.
- **Dead Letter Queue (DLQ) Quarantine:** 100% of schema-corrupted payloads quarantined to `airsafe-ingestion-dlq-dev` without pipeline interruption.

---

## 6. Cloud Cost Control & Budget Guardrails

Per **Hard Gate 5** and **ADR 012**, AirSafe Schools maintains metric-grounded pricing based on published AWS Sydney (`ap-southeast-2`) rates per [`docs/COST.md`](docs/COST.md):
1. **1,000,000 Sensor Ingestion Events:** $1.692
2. **100,000 API Decision Requests:** $0.412
3. **10,000 Bedrock Conversational AI Queries:** $1.040
4. **100 Schools Projected Monthly Cost:** **$5.28/month** (well below the $100 budget cap; actual spend to date: $3.42).
5. **Zero Provisioned Waste:** DynamoDB configured in `PAY_PER_REQUEST` on-demand mode with 30-day TTL; zero provisioned EC2/RDS instances.
6. **Automated Guardrails:** AWS Budgets circuit-breaker alerts configured at $50, $80, and $100 thresholds.
