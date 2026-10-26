# ADR 001: Amazon Bedrock Regional Quota Limitation, Fallback Strategy & Scope Accounting

## Status
Accepted

## 1. Context & Problem Statement
On Day 1 capabilities verification in AWS Sydney (`ap-southeast-2`), the engineering team conducted automated model accessibility and service quota checks using `scripts/day1-check.sh`. 

The audit established that:
1. **Amazon Nova Models (`amazon.nova-micro-v1:0` and `amazon.nova-lite-v1:0`):** Default service quotas on the AWS Builder Tier in `ap-southeast-2` are set to **`0.0 tokens/minute`**. Direct API calls via `aws bedrock-runtime converse` or AWS SDK immediately fail with:
   ```text
   An error occurred (ThrottlingException) when calling the Converse operation: Service quota reached (0.0 tokens/min) for model amazon.nova-micro-v1:0 in region ap-southeast-2.
   ```
2. **Titan Text Express (`amazon.titan-text-express-v1`):** End-of-Life / legacy restricted in `ap-southeast-2`.
3. **Titan Embed Text v2 (`amazon.titan-embed-text-v2:0`):** Operational via permitted cross-region `us-east-1` fallback.

### Quota Increase Request Evidence
To attempt unblocking model access in Sydney, a formal quota increase request was lodged via AWS Support Center / AWS Service Quotas:
- **AWS Support Case ID:** `CASE-17283940191`
- **Case Subject:** *Service Quota Increase Request: Amazon Bedrock Nova Micro & Nova Lite in ap-southeast-2*
- **Service Quota Code:** `L-404B67F0` (*Tokens per minute for Nova Micro*) & `L-D524DE68` (*Tokens per minute for Nova Lite*)
- **Initial Regional Quota Value:** `0.0` TPM
- **Requested Target Quota:** `200,000` TPM
- **Current Account Status:** Pending AWS internal trust & safety review for new accounts; initial tier constrained to 0.0 tokens/min.

---

## 2. Decision & Architecture Strategy

### A. Decision Engine Hybrid Implementation (A-1)
Rather than abandoning the Nova integration or relying purely on static mocks, the production poller implements a resilient hybrid decision engine (`services/poller/src/decisionEngine.ts`):
1. **Tool Choice Enforcement:** Bedrock calls invoke `ConverseCommand` with strictly enforced `toolChoice: { tool: { name: 'record_decision' } }` using the `RECORD_DECISION_TOOL_SPEC` schema.
2. **Monotonic Safety Dominance (`max(floor, ai)`):** The decision engine computes the deterministic policy floor (`policy.ts` / Policy v1.2) as ground truth. The final decision is calculated as `max(floor, ai)` across safety severity tiers (`PROCEED < PROCEED_WITH_PRECAUTIONS < MODIFY < MOVE_INDOORS`). AI can tighten recommendations but **can never relax safety below the policy floor**.
3. **Low Confidence Flagging:** If AI returns a confidence score below 0.6 (`confidence < 0.6`), the record is flagged (`flagged_low_confidence: true`) with reason code `LOW_CONFIDENCE_FLAG`.
4. **Metadata Preservation:** Both `modelVersion` (`amazon.nova-micro-v1:0`) and `policyVersion` (`v1.2`) are stamped into every decision record.
5. **Deterministic Policy Fallback:** When Bedrock throws `ThrottlingException` (due to regional quota 0.0), the engine safely catches the error and falls back to the deterministic policy floor with `decision_source: 'DETERMINISTIC_POLICY_FALLBACK'`.

### B. Project Brief & Hard Gate 5 Compliance (Honest Scope Accounting)
Per the Project Brief evaluation guidelines (Gate 5 - Cost Discipline & Evaluation Honesty):
> *If any MUST feature cannot be fully deployed live due to external platform constraints (e.g. AWS regional 0.0 quota), it must NOT be marked as "done". It must be explicitly documented as **"বাদ, কারণসহ"** (Excluded with documented rationale).*

Therefore:
- In `STATUS.md`, requirement **F-05** is marked as **"বাদ, কারণসহ"** rather than claiming an unverified "done".
- In `docs/device-test.md`, physical device verification explicitly documents that the assistant runs against the deterministic policy engine fallback per ADR-001, eliminating the contradictory "done" vs "partial" discrepancy.
- The raw terminal execution log of `scripts/day1-check.sh` is preserved in `docs/day1-checks.md` as empirical evidence.

---

## 3. Consequences & Verification
- **Positive:** System guarantees zero student safety regressions regardless of cloud AI model availability.
- **Positive:** Unit tests (`services/poller/src/__tests__/decisionEngine.test.ts`) verify all 6 cases: toolChoice enforcement, `max(floor, ai)` dominance, confidence < 0.6 flagging, model & policy version preservation, fail-closed telemetry guards, and fallback on quota 0.0.
- **Negative:** Full live AI synthesis requires AWS to approve quota request `CASE-17283940191`.
