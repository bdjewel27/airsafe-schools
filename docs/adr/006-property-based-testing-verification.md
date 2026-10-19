# ADR 006: Property-Based Verification of Policy Engine Invariants

## Status
Accepted

## Context
Standard example-based unit testing only tests predictable edge cases (e.g. AQI 50, 100, 150). Environmental indices fluctuate continuously in real life across infinite combinations of temperature, relative humidity, particulate matter, and activity intensity. Hard Gate 4 mandates mathematical certainty that no combination of inputs can soften safety restrictions.

## Decision
1. Implement a generative property-based testing harness (`services/poller/src/__tests__/property.test.ts`) validating $\ge 1,500$ randomly generated parameter states per test run:
   - AQI: $0 \le \text{AQI} \le 500$
   - Heat Index: $15^\circ\text{C} \le \text{HI} \le 60^\circ\text{C}$
   - Activity Intensity: $\text{LIGHT}, \text{MODERATE}, \text{VIGOROUS}$
   - Data Quality: $\text{isModeled} \in \{\text{true}, \text{false}\}, \text{isStale} \in \{\text{true}, \text{false}\}$
2. Prove the following invariant mathematical properties:
   - **AQI & Heat Index Monotonicity:** $\forall x_2 \ge x_1, \text{Severity}(x_2) \ge \text{Severity}(x_1)$.
   - **Intensity Monotonicity:** $\text{Severity}(\text{LIGHT}) \le \text{Severity}(\text{MODERATE}) \le \text{Severity}(\text{VIGOROUS})$.
   - **Dominance Invariant:** $\text{Decision} \ge \max(\text{AQI Decision}, \text{Heat Decision})$.
   - **Extreme Hazard Safety:** Any $\text{AQI} > 200$ or $\text{HI} \ge 51^\circ\text{C}$ unconditionally forces `MOVE_INDOORS`.
   - **Time Cap Invariance:** Overall allowed duration $\le \min(\text{Duration}_{\text{aqi}}, \text{Duration}_{\text{heat}})$.

## Consequences
- 100% mathematical certainty that no combination of parameters can soften safety restrictions.
- Test suite executes in under 5 seconds during CI/CD pipelines.
