# AirSafe Schools: Security Threat Model (STRIDE)

## 1. Executive Summary & Security Objectives
AirSafe Schools operates a safety-critical real-time environmental decision and generative AI platform for schools in Bangladesh. Because guidance affects children's respiratory and thermal safety during extreme heat and toxic particulate episodes, the security posture prioritizes:
1. **Decision Integrity & Monotonic Floor:** Ensuring environmental safety decisions cannot be weakened or spoofed.
2. **Tenant Isolation:** Guaranteeing absolute data separation between independent school tenants.
3. **Zero Secret Exposure:** Zero credentials, API keys, or JWT secrets in client code or public repositories.
4. **Resilience & Availability:** Guarding against ingestion queue poisoning, denial-of-wallet, and replay attacks.

---

## 2. Comprehensive STRIDE Threat Analysis Matrix

| STRIDE Threat Category | Threat Vector & Attack Surface | Impact | Implemented Mitigation & Verification |
|:---|:---|:---|:---|
| **Spoofing (S)** | 1. Malicious client forging `school_id` or `role` headers.<br>2. Man-in-the-middle forging token claims to impersonate coordinators.<br>3. Unauthorized client issuing MCP tool calls. | Unauthorized staff impersonation; viewing/modifying another school's data. | • **Cognito SRP & Immutable Claims:** Clients authenticate via Secure Remote Password (SRP). App client has empty write attributes (`writeAttributes: []`). Claims `custom:school_id` and Cognito Groups (`coordinator`, `teacher`) are strictly server-managed.<br>• **Scoped MCP Bearer Tokens:** Chat Lambda issues short-lived HMAC-SHA256 tokens (`exp` $\le 5$ min, `iss: 'airsafe-chat'`, `aud: 'airsafe-mcp'`) with mandatory `school_id`. MCP rejects forged or missing tokens with HTTP 401. |
| **Tampering (T)** | 1. Malicious sensor readings injected to falsely report "SAFE" air during smog episodes.<br>2. Malicious prompt injection attempting to force LLM to override outdoor activity policy.<br>3. Queue poisoning with malformed JSON payloads. | Students exposed to hazardous air pollution or extreme heat; pipeline crashes. | • **Strict Mathematical Policy Floor:** AI outputs and coordinator overrides cannot relax the deterministic floor (*Model School Outdoor Activity Policy v1.2*). Any prompt injection attempting relaxation is overridden by `evaluatePolicy()`.<br>• **SQS Ingestion Schema Validation:** Sensor payloads are validated against strict JSON schema. Malformed messages are immediately rejected or isolated to Dead Letter Queue (`airsafe-ingestion-dlq-dev`) after 3 attempts, preventing poisoned message loops. |
| **Repudiation (R)** | 1. Coordinator denies issuing an activity override during a hazardous heatwave.<br>2. Teacher denies logging out-of-scope context notes. | Inability to audit liability during adverse health emergencies. | • **Immutable Audit Trails:** Overrides require mandatory justification text and store user identity (`sub`), coordinator email, exact timestamp, and previous state.<br>• **CloudWatch Structured Logs:** All policy calculations and overrides generate structured, tamper-evident audit logs with 14-day retention. |
| **Information Disclosure (I)** | 1. School A teacher querying AI Assistant or REST API to inspect School B's attendance, notes, or overrides.<br>2. Tool definition schemas exposing other schools' identifiers.<br>3. Plaintext secret leaks in repository or client builds. | Cross-tenant privacy breach; credential compromise. | • **Tenant-Scoped Partition Isolation:** DynamoDB queries strictly enforce `KeyConditionExpression: school_id = :school_id` derived directly from validated token claims—never from client URL parameters or JSON bodies.<br>• **Gitleaks CI Enforcement:** Verified automated secret scanning prevents any API key, password, or HMAC secret from entering Git history.<br>• **SSM Parameter Store:** OpenAQ keys and MCP secrets are stored in AWS Systems Manager Parameter Store as `SecureString`. |
| **Denial of Service (D)** | 1. High-frequency sensor submission flood attacking the ingestion endpoint (Denial-of-Wallet).<br>2. Recursive LLM tool calls exhausting Bedrock quota and AWS budget ($100 cap).<br>3. Memory leak causing mobile app crash during long school hours. | Service unavailability; budget exhaustion; app crashes in staff room. | • **SQS Decoupled Buffering:** Ingestion queue absorbs traffic spikes (verified up to 316.8 events/sec) with partial batch failure handling.<br>• **Multi-Tier Rate Limiting:** API Gateway limits requests per IP. Daily query quotas enforce 30 requests/day for teachers and 100 for coordinators.<br>• **AWS Budgets & Circuit Breakers:** Automated alarms at $50, $80, and $100 halt non-essential poller cron tasks before budget overage.<br>• **Client Memory Bounds:** Scoped coroutines (`viewModelScope`) prevent runaway leaks (stable 44 MB heap verified over 35 min). |
| **Elevation of Privilege (E)** | 1. Teacher calling `/schools/{id}/overrides` or `/schools/{id}/invitations`.<br>2. Non-coordinator modifying campus routine schedule. | Unauthorized schedule or policy manipulation. | • **Role-Based Access Control (RBAC):** API Gateway and Lambda authorizers strictly verify Cognito group membership. Endpoints for overrides and staff invitations reject non-coordinators with HTTP 403 Forbidden.<br>• **Client-Side Defense-in-Depth:** UI hides coordinator action buttons for teacher roles. |

---

## 3. Section 10: Security Architecture & Cryptographic Token Specifications

### 3.1 MCP JWT Bearer Token Schema & Fail-Closed Enforcement
The Model Context Protocol (MCP) server (`services/mcp/src/index.ts`) enforces fail-closed authentication for all tool executions. Tokens are minted exclusively by the Chat Lambda (`services/api/src/index.ts`) via `mintMcpTokenForChat()`.

| Claim | Required Value / Type | Validation Rule | Fail-Closed Error |
| :--- | :--- | :--- | :---: |
| `alg` | `"HS256"` | Enforces HMAC-SHA256 cryptographic signature against SSM secret | HTTP 401 |
| `iss` | `'airsafe-chat'` | Strict string equality; only AirSafe Chat Lambda may issue MCP tokens | HTTP 401 |
| `aud` | `'airsafe-mcp'` | Strict string equality; audience strictly designated for MCP server | HTTP 401 |
| `exp` | Unix timestamp (seconds) | Mandatory expiration; token cannot be in the past (`exp < now`) | HTTP 401 |
| `iat` | Unix timestamp (seconds) | Mandatory issuance timestamp; rejects future timestamps (`iat > now + 30`) | HTTP 401 |
| Maximum Lifetime | `exp - iat <= 300` | Tokens cannot live longer than 5 minutes (300 seconds per Section A-6) | HTTP 401 |
| `school_id` | Non-empty string | Mandatory tenant partition identifier; client args cannot override this claim | HTTP 403 |
| `role` | `"TEACHER"` \| `"COORDINATOR"` | Optional role claim passed to execution context | - |

### 3.2 Tenant Isolation & Authentication Defenses (RBAC)
- **Invite-Only User Onboarding:** Self-registration is completely disabled in Amazon Cognito (`allowAdminCreateUserOnly: true`). New staff accounts are created solely via coordinator invitation (`POST /schools/{id}/staff/invite`).
- **PBKDF2 Password Hashing:** 600,000 iterations using Node.js `crypto.pbkdf2Sync` with SHA-512, unique 16-byte cryptographically random salt, and timing-safe comparison (`crypto.timingSafeEqual`) preventing timing attacks.
- **Client Read-Only Attributes:** Cognito attributes `custom:role` and `custom:school_id` are configured with empty write permissions (`writeAttributes: []`), preventing client-side privilege escalation.
- **Monotonic Safety Floor:** System strictly enforces `evaluatePolicyFloor()`. Neither AI assistant suggestions nor coordinator overrides can weaken safety restrictions below the mathematical baseline defined in *Model School Outdoor Activity Policy v1.2*. Any override attempting relaxation is rejected with HTTP 400 Bad Request.
- **Hot-Path O(1) Lookups:** User authentication avoids table scans (`ScanCommand`), utilizing the dedicated `STAFF_LOOKUP` partition (`Key: { school_id: 'STAFF_LOOKUP', activity_id: 'EMAIL#<email>' }`).

---

## 4. Server-Side Request Forgery (SSRF) & Replay Attack Defenses

### SSRF Defenses
- External API integrations (OpenAQ and Open-Meteo) utilize hardcoded, validated endpoint constants.
- No user-supplied URLs, webhooks, or IP addresses are accepted or fetched by Lambda functions.

### Replay & Stale Telemetry Defenses
- Sensor payloads require an ISO 8601 UTC timestamp.
- Telemetry older than 90 minutes is automatically flagged as `is_stale: true`, which forcibly clamps the decision floor to at least `PROCEED_WITH_PRECAUTIONS` (Policy Rule 4), preventing replay of historical "SAFE" conditions during an active pollution event.
- Overrides include client-generated idempotency keys preventing duplicate submissions.

---

## 5. Security Verification & Audit Checklist

- [x] **Zero Hardcoded Secrets:** Codebases scanned and verified clean via Gitleaks across 100% of git history.
- [x] **Externalized Secrets:** All secrets managed via AWS SSM Parameter Store (`SecureString`).
- [x] **Fail-Closed MCP Execution:** MCP server strictly requires bearer tokens, rejecting invalid/missing tokens with 401.
- [x] **Least-Privilege IAM:** Lambda execution roles grant only specific DynamoDB and SQS actions on designated resource ARNs.
- [x] **Cross-Tenant Isolation:** 100% verified across REST API, DynamoDB single-table keys, and AI tool calling.
- [x] **Automated Dependency Vulnerability Scanning:** GitHub Dependabot configured (`.github/dependabot.yml`) for npm, gradle, and GitHub Actions workflows.
- [x] **Signed Release Artifacts:** Android release builds signed with dedicated cryptographic keystore (`airsafe-release.jks`).
