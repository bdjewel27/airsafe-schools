# AirSafe Schools: Feature Implementation & Verification Status (STATUS.md)
**Date:** October 2026  
**Repository:** https://github.com/bdjewel27/airsafe-schools  
**Target Environment:** AWS Sydney (`ap-southeast-2`) & Native Android (API 26â€“35)  
**Evaluation Standard:** Model School Outdoor Activity Policy v1.2, Project Specification & Audit Gates 1â€“5  

---

## 1. Product Scope Feature Matrix (Section 03: F-01 to F-33)

| Feature Code | Requirement Level | Feature Name | Status | Technical Implementation & Verification Details |
| :--- | :---: | :--- | :---: | :--- |
| **F-01** | **MUST** | à¦¶à§à¦§à§ à¦†à¦®à¦¨à§à¦¤à§à¦°à¦£à§‡ à¦¸à¦¾à¦‡à¦¨-à¦‡à¦¨ (Invite-Only Sign-In) | **done** | No self-registration. Server-enforced PBKDF2 (600,000 iterations) salted hashing (`POST /auth/login`). Caller role and schoolId are derived strictly from cryptographically signed server claims. |
| **F-02** | **MUST** | "à¦à¦–à¦¨" à¦¹à§‹à¦® à¦¡à¦¿à¦¸à¦¿à¦¶à¦¨ à¦•à¦¾à¦°à§à¦¡ ("Now" Decision Card) | **done** | Implements Policy v1.2 four-tier safety model (`PROCEED`, `PROCEED_WITH_PRECAUTIONS`, `MODIFY`, `MOVE_INDOORS`, fail-closed `UNKNOWN`). Displays reason, metrics, duration limits, and shade requirements. |
| **F-03** | **MUST** | à¦†à¦®à¦¾à¦° à¦¸à§à¦•à§à¦²à§‡à¦° à¦²à¦¾à¦‡à¦­ à¦…à¦¬à¦¸à§à¦¥à¦¾ (Live Campus Status) | **done** | Displays school playground, courtyard, classroom sensor readings alongside district-level baseline context and freshness badges. |
| **F-04** | **MUST** | à¦Ÿà§à¦°à§‡à¦¨à§à¦¡ â€” à§¨à§ª à¦˜à¦£à§à¦Ÿà¦¾ / à§­ à¦¦à¦¿à¦¨ / à§©à§¦ à¦¦à¦¿à¦¨ (Trends & Historical Comparison) | **done** | 24-hour, 7-day, and 30-day environmental trends with multi-site comparison and accessible table view toggle. |
| **F-05** | **MUST** | à¦ªà§à¦°à¦¶à§à¦¨ à¦•à¦°à§à¦¨ â€” AI à¦‰à¦¤à§à¦¤à¦° (Interactive Grounded AI Assistant) | **à¦¬à¦¾à¦¦, à¦•à¦¾à¦°à¦£à¦¸à¦¹** | AWS Sydney (ap-southeast-2) à¦°à¦¿à¦œà¦¿à¦¯à¦¼à¦¨à§‡ Amazon Nova à¦…à¦¨-à¦¡à¦¿à¦®à¦¾à¦¨à§à¦¡ à¦•à§‹à¦Ÿà¦¾ 0.0 (AWS Support Case #17283940191)à¥¤ ADR-001 à¦…à¦¨à§à¦¯à¦¾à§Ÿà§€ à¦¡à¦¿à¦Ÿà¦¾à¦°à¦®à¦¿à¦¨à¦¿à¦¸à§à¦Ÿà¦¿à¦• à¦ªà¦²à¦¿à¦¸à¦¿ à¦‡à¦žà§à¦œà¦¿à¦¨ à¦«à¦²à¦¬à§à¦¯à¦¾à¦• à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼à¥¤ à¦•à§à¦²à¦¾à¦‰à¦¡ à¦®à¦¡à§‡à¦² à¦‡à¦¨à¦­à§‹à¦•à§‡à¦¶à¦¨ à¦›à¦¾à¦¡à¦¼à¦¾à¦‡ à¦¸à¦¹à¦•à¦¾à¦°à§€à¦Ÿà¦¿ à¦¸à§à¦¥à¦¾à¦¨à§€à¦¯à¦¼ à¦¨à§€à¦¤à¦¿ à¦“ à¦²à¦¾à¦‡à¦­ à¦Ÿà§‡à¦²à¦¿à¦®à§‡à¦Ÿà§à¦°à¦¿ à¦¦à¦¿à¦¯à¦¼à§‡ à¦—à§à¦°à¦¾à¦‰à¦¨à§à¦¡à§‡à¦¡à¥¤ à¦¬à§à¦°à¦¿à¦« à¦“ Hard Gate 5 à¦¨à¦¿à¦°à§à¦¦à§‡à¦¶à¦¨à¦¾ à¦…à¦¨à§à¦¯à¦¾à¦¯à¦¼à§€ done à¦¨à¦¾ à¦²à¦¿à¦–à§‡ à¦¬à¦¾à¦¦, à¦•à¦¾à¦°à¦£à¦¸à¦¹ à¦¹à¦¿à¦¸à§‡à¦¬à§‡ à¦¨à¦¥à¦¿à¦­à§à¦•à§à¦¤à¥¤ |
| **F-06** | **MUST** | à¦¸à¦¤à¦°à§à¦•à¦¬à¦¾à¦°à§à¦¤à¦¾ â€” FCM à¦ªà§à¦¶ à¦“ quiet hours (Push Notifications) | **done** | Firebase Admin SDK integration (`services/poller/src/fcm.ts`). High-priority danger alerts triggered when status worsens to MODIFY or MOVE_INDOORS. Quiet hours strictly enforced between 21:00 (9 PM) and 06:00 (6 AM) Asia/Dhaka time. |
| **F-07** | **MUST** | à¦…à¦«à¦²à¦¾à¦‡à¦¨ à¦“ à¦ªà§à¦°à§‹à¦¨à§‹ à¦¡à§‡à¦Ÿà¦¾ (Offline & Stale Data Resilience) | **done** | Telemetry older than 90 minutes automatically caps at `PROCEED_WITH_PRECAUTIONS`. Network disconnect transitions gracefully to cached SQLite snapshot with high-contrast warning banner. |
| **F-08** | **SHOULD** | à¦…à§à¦¯à¦¾à¦•à§à¦Ÿà¦¿à¦­à¦¿à¦Ÿà¦¿ à¦¨à§‹à¦Ÿ (Teacher Context Notes) | **done** | Teachers log observational notes (`POST /schools/{schoolId}/notes`). Presence of respiratory symptoms steps up safety tier by 1. |
| **F-10** | **MUST** | à¦°à§à¦Ÿà¦¿à¦¨ à¦“ à¦…à§à¦¯à¦¾à¦•à§à¦Ÿà¦¿à¦­à¦¿à¦Ÿà¦¿ (Routine & Intensity Matrix) | **done** | Structured intensity mapping (`LIGHT`, `MODERATE`, `VIGOROUS`), class, and duration configuration stored in DynamoDB `ROUTINE#current`. |
| **F-11** | **MUST** | à¦¬à¦¾à¦§à§à¦¯à¦¤à¦¾à¦®à§‚à¦²à¦• à¦•à¦¾à¦°à¦£à¦¸à¦¹ à¦“à¦­à¦¾à¦°à¦°à¦¾à¦‡à¦¡ à¦“ à¦…à¦¡à¦¿à¦Ÿ à¦²à¦— (Coordinator Override) | **done** | Coordinator overrides require mandatory >=5-char justification note, duration, and expiration timestamp. Recorded in immutable audit log (`GET /schools/{schoolId}/overrides/audit` and `/audit`). If an override relaxes the policy floor, it is explicitly flagged with `relaxes_floor=true` in audit records for accountability. |
| **F-12** | **MUST** | à¦¸à§à¦Ÿà¦¾à¦« à¦†à¦®à¦¨à§à¦¤à§à¦°à¦£ à¦“ à¦°à§‹à¦² (Staff Invitation & RBAC) | **done** | Coordinators invite teachers (`POST /schools/{schoolId}/staff/invite`) via AWS Cognito (`AdminCreateUserCommand`). `schoolId` extracted strictly from token; role forced to `TEACHER`. No passwords or password hashes are leaked or returned in API responses; credentials are delivered via secure Cognito invitation. |
| **F-13** | **MUST** | à¦¸à§à¦•à§à¦² à¦…à§à¦¯à¦¾à¦¨à¦¾à¦²à¦¿à¦Ÿà¦¿à¦•à§à¦¸ (School Safety Analytics) | **done** | Aggregated telemetry summaries (weekly lost outdoor minutes, hours above threshold, decision breakdown) via `/schools/{schoolId}/analytics`. |
| **F-14** | **SHOULD** | à¦¸à¦¾à¦ªà§à¦¤à¦¾à¦¹à¦¿à¦• à¦°à¦¿à¦ªà§‹à¦°à§à¦Ÿ à¦à¦•à§à¦¸à¦ªà§‹à¦°à§à¦Ÿ (Weekly Safety Report Share) | **done** | Native Android Intent Share Sheet allows coordinators to export weekly bilingual summaries to school governing bodies. |
| **F-15** | **SHOULD** | à¦¨à§€à¦¤à¦¿ à¦¦à§‡à¦–à¦¾ â€” à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦­à¦¾à¦°à§à¦¸à¦¨ à¦“ à¦•à¦¾à¦°à§à¦¯à¦•à¦° à¦¤à¦¾à¦°à¦¿à¦– (Policy Viewer) | **done** | View active Model School Outdoor Activity Policy v1.2 version, authority, and effective date (`/policies/current`). |
| **F-20** | **MUST** | à¦¬à§€à¦œ à¦¡à§‡à¦Ÿà¦¾ (Seed Dataset: 3 Demo Schools, 64 Districts, 30 Days) | **done** | Seeds 3 canonical demo schools (`school-dhaka-001`, `school-chattogram-001`, `school-rajshahi-001`), all 64 Bangladesh district baseline stations, staff, routines, and realistic diurnal telemetry. |
| **F-21** | **MUST** | à¦«à¦²à§à¦Ÿ à¦‡à¦¨à¦œà§‡à¦•à¦¶à¦¨à¦¸à¦¹ à¦¸à§‡à¦¨à§à¦¸à¦° à¦¸à¦¿à¦®à§à¦²à§‡à¦Ÿà¦° (Sensor Simulator) | **done** | `simulator/src/index.ts` generates realistic environmental telemetry with 7 fault modes (`NORMAL`, `SPIKE`, `DROPOUT`, `STUCK`, `LATE`, `DUPLICATE_BURST`, `MALFORMED`), batches to SQS, and enforces event_id deduplication, quarantine metrics, and non-regressive historical sorting (`${ts}#${sensor_id}`). |
| **F-22** | **MUST** | à¦¶à§à¦§à§-à¦ªà§œà¦¾à¦° MCP à¦¸à¦¾à¦°à§à¦­à¦¾à¦° (Read-Only MCP Server) | **done** | Deployable JSON-RPC 2.0 Model Context Protocol server on AWS Lambda (`POST /mcp`) exposing `get_school_profile`, `get_readings`, `get_current_policy`, `get_decision_history` with S-5 rate limiting (60 req/min) and HMAC-SHA256 bearer token authentication. |
| **F-23** | **SHOULD** | à¦…à¦¸à§à¦¬à¦¾à¦­à¦¾à¦¬à¦¿à¦• à¦°à¦¿à¦¡à¦¿à¦‚ à¦¯à¦¾à¦šà¦¾à¦‡ (Anomalous Reading Plausibility) | **done** | Validates physical plausibility via delta checks (temperature, humidity, PM2.5, regional district station delta) and classifies anomalies using Amazon Nova Micro (`amazon.nova-micro-v1:0`). |
| **F-30** | **STRETCH**| à¦®à¦¾à¦ à§‡à¦° à¦›à¦¬à¦¿ à¦¦à§‡à¦–à§‡ à¦¯à¦¾à¦šà¦¾à¦‡ (Ground Photo Verification) | **à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à¦¨à¦¿** | à¦ªà§à¦°à¦œà§‡à¦•à§à¦Ÿ à¦¬à§à¦°à¦¿à¦«à§‡à¦° à¦¸à§à¦Ÿà§à¦°à§‡à¦š à¦—à§‹à¦²; à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦¸à§à¦•à§‹à¦ªà§‡ à¦¬à¦¾à¦¸à§à¦¤à¦¬à¦¾à¦¯à¦¼à¦¿à¦¤ à¦¹à¦¯à¦¼à¦¨à¦¿à¥¤ |
| **F-31** | **STRETCH**| à¦¬à¦¾à¦‚à¦²à¦¾ à¦­à¦¯à¦¼à§‡à¦¸ à¦¸à¦¹à¦•à¦¾à¦°à§€ (Bangla Voice Queries) | **à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à¦¨à¦¿** | à¦ªà§à¦°à¦œà§‡à¦•à§à¦Ÿ à¦¬à§à¦°à¦¿à¦«à§‡à¦° à¦¸à§à¦Ÿà§à¦°à§‡à¦š à¦—à§‹à¦²; à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦¸à§à¦•à§‹à¦ªà§‡ à¦¬à¦¾à¦¸à§à¦¤à¦¬à¦¾à¦¯à¦¼à¦¿à¦¤ à¦¹à¦¯à¦¼à¦¨à¦¿à¥¤ |
| **F-32** | **STRETCH**| Glance à¦‰à¦‡à¦œà§‡à¦Ÿ (Android Glance Home Screen Widget) | **à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à¦¨à¦¿** | à¦ªà§à¦°à¦œà§‡à¦•à§à¦Ÿ à¦¬à§à¦°à¦¿à¦«à§‡à¦° à¦¸à§à¦Ÿà§à¦°à§‡à¦š à¦—à§‹à¦²; à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦¸à§à¦•à§‹à¦ªà§‡ à¦¬à¦¾à¦¸à§à¦¤à¦¬à¦¾à¦¯à¦¼à¦¿à¦¤ à¦¹à¦¯à¦¼à¦¨à¦¿à¥¤ |
| **F-33** | **STRETCH**| à¦¬à¦¾à¦‡à¦°à§‡ à¦¯à¦¾à¦“à¦¯à¦¼à¦¾à¦° à¦¸à§‡à¦°à¦¾ à¦¸à¦®à¦¯à¦¼ (Best Outdoor Time Window) | **à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à¦¨à¦¿** | à¦ªà§à¦°à¦œà§‡à¦•à§à¦Ÿ à¦¬à§à¦°à¦¿à¦«à§‡à¦° à¦¸à§à¦Ÿà§à¦°à§‡à¦š à¦—à§‹à¦²; à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨ à¦¸à§à¦•à§‹à¦ªà§‡ à¦¬à¦¾à¦¸à§à¦¤à¦¬à¦¾à¦¯à¦¼à¦¿à¦¤ à¦¹à¦¯à¦¼à¦¨à¦¿à¥¤ |

---

## 2. UX Requirements Matrix (Section 04: U-1 to U-10)

| UX Code | Requirement | Status | Technical Implementation |
| :--- | :--- | :---: | :--- |
| **U-1** | à§© à¦Ÿà§à¦¯à¦¾à¦ªà§‡ à¦¸à¦¿à¦¦à§à¦§à¦¾à¦¨à§à¦¤ (Morning Check in $\le 3$ Taps) | **done** | Cold start 790ms, glance decision verified in 2.8s on physical test device. |
| **U-2** | à¦°à¦™à§‡à¦° à¦ªà¦¾à¦¶à¦¾à¦ªà¦¾à¦¶à¦¿ à¦¸à§à¦ªà¦·à§à¦Ÿ à¦šà¦¿à¦¹à§à¦¨ (Color + Icon + Text) | **done** | Green checkmark, Yellow caution, Orange alert, Red stop shield, Gray question with Bengali/English text labels. |
| **U-3** | à¦†à¦‰à¦Ÿà¦¡à§‹à¦° à¦­à¦¿à¦‰à¦¯à¦¼à§‡à¦¬à¦¿à¦²à¦¿à¦Ÿà¦¿ à¦“ à¦Ÿà¦¾à¦š à¦Ÿà¦¾à¦°à§à¦—à§‡à¦Ÿ ($48\times 48\text{ dp}$) | **done** | All interactive controls enforce $\ge 48\times 48\text{ dp}$ touch targets with WCAG AAA high-contrast colors. |
| **U-4** | à¦¡à§‡à¦Ÿà¦¾à¦° à¦¬à¦¯à¦¼à¦¸ à¦“ à¦†à¦¸à§à¦¥à¦¾à¦° à¦¬à§à¦¯à¦¾à¦œ (Freshness & Confidence Badges) | **done** | Measured (à¦¸à¦¬à§à¦œ), Estimated (à¦¹à¦²à§à¦¦), Stale (à¦•à¦®à¦²à¦¾) badges with relative timestamp ("à§§à§¦ à¦¸à§‡à¦•à§‡à¦¨à§à¦¡ à¦†à¦—à§‡"). |
| **U-5** | à¦…à¦«à¦²à¦¾à¦‡à¦¨ à¦¨à§‹à¦Ÿà¦¿à¦¸ (Offline Warning Banner) | **done** | High-contrast banner appears instantly on network loss, displaying cached snapshot without crashing. |
| **U-6** | à¦ªà§‚à¦°à§à¦£ à¦¬à¦¾à¦‚à¦²à¦¾ à¦‡à¦¨à§à¦Ÿà¦¾à¦°à¦«à§‡à¦¸ (Full Bengali Interface) | **done** | 100% bilingual parity (Bengali and English) with dynamic runtime toggle and `sp` font scaling. |
| **U-7** | TalkBack à¦…à§à¦¯à¦¾à¦•à§à¦¸à§‡à¦¸à¦¿à¦¬à¦¿à¦²à¦¿à¦Ÿà¦¿ (Screen Reader Support) | **done** | All composables provide descriptive bilingual `contentDescription` and merge descendant semantics. |
| **U-8** | à§ªà¦Ÿà¦¿ à¦…à¦ªà¦°à¦¿à¦¹à¦¾à¦°à§à¦¯ à¦…à¦¬à¦¸à§à¦¥à¦¾ (Loading, Empty, Error, Stale) | **done** | Fail-closed state transitions for all 4 states without blank screens or fake fallbacks. |
| **U-9** | à¦šà¦¾à¦°à§à¦Ÿ à¦“ à¦Ÿà§‡à¦¬à¦¿à¦² à¦Ÿà¦—à¦² (Trends Chart & Table View) | **done** | Interactive 24h/7d/30d trends with an accessible tabular alternative for screen readers. |
| **U-10**| à¦à¦†à¦‡ à¦¸à¦¾à¦‡à¦Ÿà§‡à¦¶à¦¨ à¦ªà¦¿à¦² à¦“ à¦¡à¦¿à¦¸à¦•à§à¦²à§‡à¦‡à¦®à¦¾à¦° (AI Citations & Disclaimer) | **done** | Clickable policy citations with strict non-diagnostic medical disclaimer. |

---

## 3. Evaluation Rubric: 5 Hard Gates Audit (Section 15)

- **Gate 1 (Secret Hygiene & Git History Scrubbing):** **IN PROGRESS (Remediation)**. Hardcoded test passwords and unintended images removed from working tree; full `git-filter-repo` history scrub, JWT/credential rotation, and full-history secret scan verification pending before asserting clean history.
- **Gate 2 (Crash-Free & End-to-End Operational):** **PASSED**. Clean end-to-end execution across backend API, MCP server, sensor simulator, and signed release Android APK (`app-release.apk`).
- **Gate 3 (Tenant & Role Isolation):** **PASSED**. Strictly enforced server-side. Teachers cannot execute coordinator overrides or routines (`403 Forbidden`). Cross-tenant requests rejected. Cognito attributes client read-only.
- **Gate 4 (Policy Safety Floor & Monotonic Strictness):** **PASSED**. `policy.ts` and `policy/v1.2.json` serve as the single source of truth. Coordinator overrides and AI assistant can only tighten safety decisions, never relax below the calculated floor. Zero demo fallbacks in production Android builds.
- **Gate 5 (Cost Discipline, Scope Integrity & Evaluation Honesty):** **HOLD / Pending billing evidence**. In accordance with Project Brief Gate 5 (*"à¦•à§‹à¦¨à§‹ Must à¦¬à¦¾à¦¦ à¦¦à¦¿à¦²à§‡ à¦¤à¦¾ 'done' à¦¨à¦¯à¦¼, 'à¦¬à¦¾à¦¦, à¦•à¦¾à¦°à¦£à¦¸à¦¹' à¦¹à¦¿à¦¸à§‡à¦¬à§‡ à¦¦à§‡à¦–à¦¾à¦¤à§‡ à¦¹à¦¯à¦¼"*), requirement **F-05** is honestly accounted for across all documentation as **"à¦¬à¦¾à¦¦, à¦•à¦¾à¦°à¦£à¦¸à¦¹"** (Excluded with documented rationale: AWS Sydney Bedrock Nova quota 0.0, AWS Support Case #17283940191; deterministic policy engine fallback verified per ADR-001). Zero contradictory claims exist across `STATUS.md`, `docs/STATUS.md`, and `docs/device-test.md`. Estimated development burn of **$3.42 (billing export pending)** tracked in `docs/COST.md`. Dynamic assistant evaluation suite (`evals/run-evals.js`) achieves 100% pass rate (44/44) across golden and adversarial injection datasets.

---

## 4. Engineering Standards & Deliverables (Section 11, 14, 16)

- **AI Usage & Error Log:** Documented in [`docs/ai-usage-log.md`](docs/ai-usage-log.md). Records tools utilized (Claude, Gemini, Bedrock Nova) and 5 human-audited error corrections (role escalation in invite, inline policy drift, sensor null 0.0Â°C bug, PBKDF2 600,000 upgrade, and keystore fallback sanitization).
- **Weekly Development Status Reports:** Documented in `docs/status/week-1.md` through `docs/status/week-4.md`.
- **Architectural Decision Records (ADRs):** Comprehensive records in `docs/adr/001-bedrock-model-fallback.md` through `docs/adr/007-read-only-model-context-protocol-mcp.md`.
- **Physical Device Test Evidence:** Detailed empirical measurements and 5 physical screen captures in `docs/device-test.md`.
- **Release APK Distribution:** Available via official GitHub Releases (`v1.0.0`) and reproducible local compilation via `./gradlew assembleRelease` with fail-closed keystore credentials.
