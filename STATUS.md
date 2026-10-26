# AirSafe Schools: Feature Implementation & Verification Status (STATUS.md)
**Date:** October 2026  
**Repository:** https://github.com/bdjewel27/airsafe-schools  
**Target Environment:** AWS Sydney (`ap-southeast-2`) & Native Android (API 26–35)  
**Evaluation Standard:** Model School Outdoor Activity Policy v1.2, Project Specification & Audit Gates 1–5  

---

## 1. Product Scope Feature Matrix (Section 03: F-01 to F-33)

| Feature Code | Requirement Level | Feature Name | Status | Technical Implementation & Verification Details |
| :--- | :---: | :--- | :---: | :--- |
| **F-01** | **MUST** | শুধু আমন্ত্রণে সাইন-ইন (Invite-Only Sign-In) | **done** | No self-registration. Server-enforced PBKDF2 (600,000 iterations) salted hashing (`POST /auth/login`). Caller role and schoolId are derived strictly from cryptographically signed server claims. |
| **F-02** | **MUST** | "এখন" হোম ডিসিশন কার্ড ("Now" Decision Card) | **done** | Implements Policy v1.2 four-tier safety model (`PROCEED`, `PROCEED_WITH_PRECAUTIONS`, `MODIFY`, `MOVE_INDOORS`, fail-closed `UNKNOWN`). Displays reason, metrics, duration limits, and shade requirements. |
| **F-03** | **MUST** | আমার স্কুলের লাইভ অবস্থা (Live Campus Status) | **done** | Displays school playground, courtyard, classroom sensor readings alongside district-level baseline context and freshness badges. |
| **F-04** | **MUST** | ট্রেন্ড — ২৪ ঘণ্টা / ৭ দিন / ৩০ দিন (Trends & Historical Comparison) | **done** | 24-hour, 7-day, and 30-day environmental trends with multi-site comparison and accessible table view toggle. |
| **F-05** | **MUST** | প্রশ্ন করুন — AI উত্তর (Interactive Grounded AI Assistant) | **done** | Conversational safety assistant grounded in live telemetry and Policy v1.2. Architecture uses query router, guardrails, and read-only MCP tools; runs deterministic fallback per ADR-001 (Sydney quota 0.0). 40/40 evals passed. |
| **F-06** | **MUST** | সতর্কবার্তা — FCM পুশ ও quiet hours (Push Notifications) | **done** | Firebase Admin SDK integration (`services/poller/src/fcm.ts`). High-priority danger alerts triggered when status worsens to MODIFY or MOVE_INDOORS. Quiet hours strictly enforced between 21:00 (9 PM) and 06:00 (6 AM) Asia/Dhaka time. |
| **F-07** | **MUST** | অফলাইন ও পুরোনো ডেটা (Offline & Stale Data Resilience) | **done** | Telemetry older than 90 minutes automatically caps at `PROCEED_WITH_PRECAUTIONS`. Network disconnect transitions gracefully to cached SQLite snapshot with high-contrast warning banner. |
| **F-08** | **SHOULD** | অ্যাক্টিভিটি নোট (Teacher Context Notes) | **done** | Teachers log observational notes (`POST /schools/{schoolId}/notes`). Presence of respiratory symptoms steps up safety tier by 1. |
| **F-10** | **MUST** | রুটিন ও অ্যাক্টিভিটি (Routine & Intensity Matrix) | **done** | Structured intensity mapping (`LIGHT`, `MODERATE`, `VIGOROUS`), class, and duration configuration stored in DynamoDB `ROUTINE#current`. |
| **F-11** | **MUST** | বাধ্যতামূলক কারণসহ ওভাররাইড ও অডিট লগ (Coordinator Override) | **done** | Strict tighten-only semantics. Overrides can only make decisions more restrictive, never relax policy floors (HTTP 400 rejection on relaxation). Requires mandatory justification note and writes to immutable audit log. |
| **F-12** | **MUST** | স্টাফ আমন্ত্রণ ও রোল (Staff Invitation & RBAC) | **done** | Coordinators invite teachers (`POST /schools/{schoolId}/staff/invite`). `schoolId` extracted strictly from token; role forced to `TEACHER`. Temporary password returned with zero password hash leakage. |
| **F-13** | **MUST** | স্কুল অ্যানালিটিক্স (School Safety Analytics) | **done** | Aggregated telemetry summaries (weekly lost outdoor minutes, hours above threshold, decision breakdown) via `/schools/{schoolId}/analytics`. |
| **F-14** | **SHOULD** | সাপ্তাহিক রিপোর্ট এক্সপোর্ট (Weekly Safety Report Share) | **done** | Native Android Intent Share Sheet allows coordinators to export weekly bilingual summaries to school governing bodies. |
| **F-15** | **SHOULD** | নীতি দেখা — বর্তমান ভার্সন ও কার্যকর তারিখ (Policy Viewer) | **done** | View active Model School Outdoor Activity Policy v1.2 version, authority, and effective date (`/policies/current`). |
| **F-20** | **MUST** | বীজ ডেটা (Seed Dataset: 5 Demo Schools, 64 Districts, 30 Days) | **done** | Seeds 5 representative schools (Dhaka 2, Chittagong 1, Khulna 1, Rajshahi 1), 64 districts baseline, and 30-day realistic diurnal telemetry. |
| **F-21** | **MUST** | ফল্ট ইনজেকশনসহ সেন্সর সিমুলেটর (Sensor Simulator) | **done** | `simulator/sensor-sim.js` generates `normal`, `pollution-wave`, `heat-spike`, `monsoon` scenarios with 6 fault injections (`stale`, `drop`, `out-of-range`, `duplicate`, `out-of-order`, `clock-skew`). |
| **F-22** | **MUST** | শুধু-পড়ার MCP সার্ভার (Read-Only MCP Server) | **done** | JSON-RPC 2.0 Model Context Protocol server exposing `get_school_profile`, `get_readings`, `get_current_policy`, `get_decision_history`. HMAC-SHA256 bearer token authentication. |
| **F-23** | **SHOULD** | অস্বাভাবিক রিডিং যাচাই (Anomalous Reading Plausibility) | **done** | Validates delta limits (e.g. max 5°C/hr shift) and cross-checks outdoor sensors against regional district stations. |
| **F-30** | **STRETCH**| মাঠের ছবি দেখে যাচাই (Ground Photo Verification) | **করা হয়নি** | প্রজেক্ট ব্রিফের স্ট্রেচ গোল; বর্তমান স্কোপে বাস্তবায়িত হয়নি। |
| **F-31** | **STRETCH**| বাংলা ভয়েস সহকারী (Bangla Voice Queries) | **করা হয়নি** | প্রজেক্ট ব্রিফের স্ট্রেচ গোল; বর্তমান স্কোপে বাস্তবায়িত হয়নি। |
| **F-32** | **STRETCH**| Glance উইজেট (Android Glance Home Screen Widget) | **করা হয়নি** | প্রজেক্ট ব্রিফের স্ট্রেচ গোল; বর্তমান স্কোপে বাস্তবায়িত হয়নি। |
| **F-33** | **STRETCH**| বাইরে যাওয়ার সেরা সময় (Best Outdoor Time Window) | **করা হয়নি** | প্রজেক্ট ব্রিফের স্ট্রেচ গোল; বর্তমান স্কোপে বাস্তবায়িত হয়নি। |

---

## 2. UX Requirements Matrix (Section 04: U-1 to U-10)

| UX Code | Requirement | Status | Technical Implementation |
| :--- | :--- | :---: | :--- |
| **U-1** | ৩ ট্যাপে সিদ্ধান্ত (Morning Check in $\le 3$ Taps) | **done** | Cold start 790ms, glance decision verified in 2.8s on physical test device. |
| **U-2** | রঙের পাশাপাশি স্পষ্ট চিহ্ন (Color + Icon + Text) | **done** | Green checkmark, Yellow caution, Orange alert, Red stop shield, Gray question with Bengali/English text labels. |
| **U-3** | আউটডোর ভিউয়েবিলিটি ও টাচ টার্গেট ($48\times 48\text{ dp}$) | **done** | All interactive controls enforce $\ge 48\times 48\text{ dp}$ touch targets with WCAG AAA high-contrast colors. |
| **U-4** | ডেটার বয়স ও আস্থার ব্যাজ (Freshness & Confidence Badges) | **done** | Measured (সবুজ), Estimated (হলুদ), Stale (কমলা) badges with relative timestamp ("১০ সেকেন্ড আগে"). |
| **U-5** | অফলাইন নোটিস (Offline Warning Banner) | **done** | High-contrast banner appears instantly on network loss, displaying cached snapshot without crashing. |
| **U-6** | পূর্ণ বাংলা ইন্টারফেস (Full Bengali Interface) | **done** | 100% bilingual parity (Bengali and English) with dynamic runtime toggle and `sp` font scaling. |
| **U-7** | TalkBack অ্যাক্সেসিবিলিটি (Screen Reader Support) | **done** | All composables provide descriptive bilingual `contentDescription` and merge descendant semantics. |
| **U-8** | ৪টি অপরিহার্য অবস্থা (Loading, Empty, Error, Stale) | **done** | Fail-closed state transitions for all 4 states without blank screens or fake fallbacks. |
| **U-9** | চার্ট ও টেবিল টগল (Trends Chart & Table View) | **done** | Interactive 24h/7d/30d trends with an accessible tabular alternative for screen readers. |
| **U-10**| এআই সাইটেশন পিল ও ডিসক্লেইমার (AI Citations & Disclaimer) | **done** | Clickable policy citations with strict non-diagnostic medical disclaimer. |

---

## 3. Evaluation Rubric: 5 Hard Gates Audit (Section 15)

- **Gate 1 (Zero Secrets in Repository or History):** **PASSED**. Keystore fallback removed (`android/app/build.gradle.kts`); clean orphan git history established (`5f7164c`). Zero credentials in code, repo, or git history.
- **Gate 2 (Crash-Free & End-to-End Operational):** **PASSED**. Clean end-to-end execution across backend API, MCP server, sensor simulator, and signed release Android APK (`app-release.apk`).
- **Gate 3 (Tenant & Role Isolation):** **PASSED**. Strictly enforced server-side. Teachers cannot execute coordinator overrides or routines (`403 Forbidden`). Cross-tenant requests rejected. Cognito attributes client read-only.
- **Gate 4 (Policy Safety Floor & Monotonic Strictness):** **PASSED**. `policy.ts` and `policy/v1.2.json` serve as the single source of truth. Coordinator overrides and AI assistant can only tighten safety decisions, never relax below the calculated floor. Zero demo fallbacks in production Android builds.
- **Gate 5 (Cost Discipline & Evaluation Honesty):** **PASSED**. Empirical development burn of **$3.42** honestly tracked in `docs/COST.md` (Sydney Bedrock quota 0.0 documented in `docs/day1-checks.md` and ADR-001). Dynamic assistant evaluation suite (`evals/run-evals.js`) achieves 100% pass rate (40/40) on golden dataset.

---

## 4. Engineering Standards & Deliverables (Section 11, 14, 16)

- **AI Usage & Error Log:** Documented in [`docs/ai-usage-log.md`](docs/ai-usage-log.md). Records tools utilized (Claude, Gemini, Bedrock Nova) and 5 human-audited error corrections (role escalation in invite, inline policy drift, sensor null 0.0°C bug, PBKDF2 600,000 upgrade, and keystore fallback sanitization).
- **Weekly Development Status Reports:** Documented in `docs/status/week-1.md` through `docs/status/week-4.md`.
- **Architectural Decision Records (ADRs):** Comprehensive records in `docs/adr/001-bedrock-model-fallback.md` through `docs/adr/007-read-only-model-context-protocol-mcp.md`.
- **Physical Device Test Evidence:** Detailed empirical measurements and 5 physical screen captures in `docs/device-test.md`.
- **Release APK Distribution:** Available via official GitHub Releases (`v1.0.0`) and reproducible local compilation via `./gradlew assembleRelease` with fail-closed keystore credentials.
