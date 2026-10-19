# ADR 003: Strict Monotonic Policy Floor & Deterministic Rule Dominance

## Status
Accepted

## Context
Children's health decisions are high-stakes. A standard Generative AI LLM output can suffer from probabilistic hallucination or sycophancy, potentially suggesting that children may play outdoors under dangerous heat (e.g. Heat Index > 42°C) or severe particulate smog (AQI > 160). The project mandates a "Floor" guarantee: AI may only tighten restrictions, never relax them.

## Decision
1. Implement a purely deterministic, mathematical rule evaluation engine based on *Model School Outdoor Activity Policy v1.2* (Appendix A).
2. Calculate the Baseline Rule Floor independently of any LLM inference:
   - Severity ordering: `PROCEED` (1) < `PROCEED_WITH_PRECAUTIONS` (2) < `MODIFY` (3) < `MOVE_INDOORS` (4).
   - Dominance Principle: The overall safety decision is strictly the maximum severity between the AQI sub-decision and Heat Index sub-decision: $\text{Severity}_{\text{final}} = \max(\text{Severity}_{\text{aqi}}, \text{Severity}_{\text{heat}})$.
   - Modeled Data Cap (Rule 3) and Stale Data Cap (Rule 4): Automatically enforce a floor of at least `PROCEED_WITH_PRECAUTIONS`.
3. If an AI Assistant or human coordinator suggests an action, the system validates the proposed decision against the computed floor. Any recommendation that violates monotonicity is rejected and overridden by the deterministic floor.

## Consequences
- Guaranteed zero false-safe evaluations.
- Verified by property-based test suites running over 1,500 continuous scenario variations.
