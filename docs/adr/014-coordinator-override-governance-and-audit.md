# ADR 014: Coordinator Safety Override Governance, Fail-Closed Telemetry Verification, and Audit Trail

## Status
Accepted

## Context
Under the *Model School Outdoor Activity Policy v1.2* (Appendix A / F-11), safety decisions are calculated deterministically to establish an environmental safety floor. However, emergency operational conditions and on-the-ground context require that authorized school coordinators possess administrative override authority.

Previously:
1. The API attempted an unconditional HTTP 400 rejection for any override that relaxed the computed floor, contradicting Appendix A specifications that permit relaxing overrides when accompanied by mandatory rationale and coordinator accountability.
2. The floor evaluation hardcoded activity intensity as `MODERATE`, ignoring whether the active scheduled routine was `VIGOROUS` or `LIGHT`.
3. If sensor reading queries failed, an empty `catch` block silently swallowed the error and recorded the override without floor verification (a fail-open defect). Similarly, absence of readings bypassed checks.

## Decision
1. **Fail-Closed Telemetry Verification (S4):**
   When processing `POST /schools/{schoolId}/overrides`, the system queries the latest sensor telemetry from the readings table. If reading queries fail or no telemetry is found for the school, the endpoint immediately fails-closed with `HTTP 503 Service Unavailable`. Overrides are never accepted in the blind without verifying baseline telemetry.

2. **Dynamic Routine Intensity Alignment:**
   The policy floor is evaluated against the school's actual scheduled routine (`ROUTINE#current`), dynamically using its specific intensity (`vigorous`, `moderate`, or `light`), defaulting to `moderate` only if no routine is defined.

3. **Permit Overrides with Rigorous Audit Logging (F-11 / Appendix A):**
   Authorized coordinators may record overrides that tighten or relax the deterministic policy floor. All overrides strictly require:
   - Mandatory written rationale of at least 5 characters.
   - Captured coordinator identity (`coordinator_email`).
   - Flagging `relaxes_floor: true` whenever the requested decision is less restrictive than the computed policy floor.
   - Recording the computed `policy_floor` and `intensity` at the time of override.
   - Dual-persistence to active state (`OVERRIDE#active`) and an append-only audit stream (`OVERRIDE_AUDIT#<iso>`).

4. **Transparent Decision Reflection:**
   The active override determines the school's `effectiveDecision`. The decision payload and reasons array explicitly denote that a coordinator override is active and indicate whether the baseline policy floor was relaxed.

## Consequences
- Full compliance with Appendix A and F-11 requirements.
- Zero fail-open silent bypasses when telemetry databases are unreachable.
- Complete accountability and auditability for all override actions.
