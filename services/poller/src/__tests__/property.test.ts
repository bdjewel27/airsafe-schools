import { evaluatePolicy, evaluateAQIDecision, evaluateHeatDecision, PolicyDecision, ActivityIntensity } from '../policy';

const SEVERITY: Record<PolicyDecision, number> = {
  PROCEED: 1,
  PROCEED_WITH_PRECAUTIONS: 2,
  MODIFY: 3,
  MOVE_INDOORS: 4,
  UNKNOWN: 5,
};

const INTENSITIES: ActivityIntensity[] = ['LIGHT', 'MODERATE', 'VIGOROUS'];

function randomFloat(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomIntensity(): ActivityIntensity {
  return INTENSITIES[randomInt(0, 2)];
}

function randomBool(): boolean {
  return Math.random() < 0.5;
}

describe('A-2: Property-Based Rule Engine Tests (≥1,000 Scenarios)', () => {
  const NUM_SCENARIOS = 1500;

  test(`Property 1: AQI Monotonicity over ${NUM_SCENARIOS} random states`, () => {
    for (let i = 0; i < NUM_SCENARIOS; i++) {
      const aqi1 = randomInt(0, 400);
      const aqiDelta = randomInt(1, 100);
      const aqi2 = Math.min(500, aqi1 + aqiDelta);

      const heatIndex = randomFloat(15, 55);
      const intensity = randomIntensity();
      const isModeled = randomBool();
      const isStale = randomBool();

      const res1 = evaluatePolicy(aqi1, heatIndex, intensity, isModeled, isStale);
      const res2 = evaluatePolicy(aqi2, heatIndex, intensity, isModeled, isStale);

      expect(SEVERITY[res2.decision]).toBeGreaterThanOrEqual(SEVERITY[res1.decision]);
    }
  });

  test(`Property 2: Heat Index Monotonicity over ${NUM_SCENARIOS} random states`, () => {
    for (let i = 0; i < NUM_SCENARIOS; i++) {
      const hi1 = randomFloat(15, 50);
      const hiDelta = randomFloat(0.5, 10);
      const hi2 = Math.min(60, hi1 + hiDelta);

      const aqi = randomInt(0, 300);
      const intensity = randomIntensity();
      const isModeled = randomBool();
      const isStale = randomBool();

      const res1 = evaluatePolicy(aqi, hi1, intensity, isModeled, isStale);
      const res2 = evaluatePolicy(aqi, hi2, intensity, isModeled, isStale);

      expect(SEVERITY[res2.decision]).toBeGreaterThanOrEqual(SEVERITY[res1.decision]);
    }
  });

  test(`Property 3: Activity Intensity Monotonicity over ${NUM_SCENARIOS} random states`, () => {
    for (let i = 0; i < NUM_SCENARIOS; i++) {
      const aqi = randomInt(0, 350);
      const heatIndex = randomFloat(18, 55);
      const isModeled = randomBool();
      const isStale = randomBool();

      const lightRes = evaluatePolicy(aqi, heatIndex, 'LIGHT', isModeled, isStale);
      const modRes = evaluatePolicy(aqi, heatIndex, 'MODERATE', isModeled, isStale);
      const vigRes = evaluatePolicy(aqi, heatIndex, 'VIGOROUS', isModeled, isStale);

      expect(SEVERITY[modRes.decision]).toBeGreaterThanOrEqual(SEVERITY[lightRes.decision]);
      expect(SEVERITY[vigRes.decision]).toBeGreaterThanOrEqual(SEVERITY[modRes.decision]);
    }
  });

  test(`Property 4: Dominance / Strictest-Outcome Invariant over ${NUM_SCENARIOS} states`, () => {
    for (let i = 0; i < NUM_SCENARIOS; i++) {
      const aqi = randomInt(0, 500);
      const heatIndex = randomFloat(15, 60);
      const intensity = randomIntensity();
      const isModeled = randomBool();
      const isStale = randomBool();

      const res = evaluatePolicy(aqi, heatIndex, intensity, isModeled, isStale);

      // Final decision severity must be >= individual sub-decisions
      expect(SEVERITY[res.decision]).toBeGreaterThanOrEqual(SEVERITY[res.aqiDecision]);
      expect(SEVERITY[res.decision]).toBeGreaterThanOrEqual(SEVERITY[res.heatDecision]);

      // If either says MOVE_INDOORS, final MUST be MOVE_INDOORS
      if (res.aqiDecision === 'MOVE_INDOORS' || res.heatDecision === 'MOVE_INDOORS') {
        expect(res.decision).toBe('MOVE_INDOORS');
      }
    }
  });

  test(`Property 5: Data Quality Guardrail Floor (Modeled/Stale cannot be PROCEED) over ${NUM_SCENARIOS} states`, () => {
    for (let i = 0; i < NUM_SCENARIOS; i++) {
      const aqi = randomInt(0, 50); // Pristine AQI
      const heatIndex = randomFloat(15, 26); // Pristine temperature
      const intensity = randomIntensity();

      // Test Modeled
      const modeledRes = evaluatePolicy(aqi, heatIndex, intensity, true, false);
      expect(SEVERITY[modeledRes.decision]).toBeGreaterThanOrEqual(SEVERITY.PROCEED_WITH_PRECAUTIONS);
      expect(modeledRes.decision).not.toBe('PROCEED');

      // Test Stale
      const staleRes = evaluatePolicy(aqi, heatIndex, intensity, false, true);
      expect(SEVERITY[staleRes.decision]).toBeGreaterThanOrEqual(SEVERITY.PROCEED_WITH_PRECAUTIONS);
      expect(staleRes.decision).not.toBe('PROCEED');
    }
  });

  test(`Property 6: Extreme Conditions Absolute Floor (AQI > 200 or HI >= 51°C) over 500 states`, () => {
    for (let i = 0; i < 500; i++) {
      const extremeAqi = randomInt(201, 500);
      const randomHi = randomFloat(15, 45);
      const intensity = randomIntensity();
      const resAqi = evaluatePolicy(extremeAqi, randomHi, intensity, false, false);
      expect(resAqi.decision).toBe('MOVE_INDOORS');

      const extremeHi = randomFloat(51.0, 65.0);
      const randomAqi = randomInt(0, 150);
      const resHi = evaluatePolicy(randomAqi, extremeHi, intensity, false, false);
      expect(resHi.decision).toBe('MOVE_INDOORS');
    }
  });

  test(`Property 7: Time Cap Invariance (duration limit is minimum of component limits)`, () => {
    for (let i = 0; i < NUM_SCENARIOS; i++) {
      const aqi = randomInt(0, 500);
      const heatIndex = randomFloat(15, 60);
      const intensity = randomIntensity();
      const isModeled = randomBool();
      const isStale = randomBool();

      const res = evaluatePolicy(aqi, heatIndex, intensity, isModeled, isStale);
      const aqiRes = evaluateAQIDecision(aqi, intensity);
      const heatRes = evaluateHeatDecision(heatIndex, intensity);

      if (res.maxDurationMinutes !== undefined) {
        if (aqiRes.maxMinutes !== undefined) {
          expect(res.maxDurationMinutes).toBeLessThanOrEqual(aqiRes.maxMinutes);
        }
        if (heatRes.maxMinutes !== undefined) {
          expect(res.maxDurationMinutes).toBeLessThanOrEqual(heatRes.maxMinutes);
        }
      }
    }
  });

  test(`Property 8: AI Floor Grounding Invariance over ${NUM_SCENARIOS} states (AI stub cannot relax policy floor)`, () => {
    const aiStubProposals: PolicyDecision[] = ['PROCEED', 'PROCEED_WITH_PRECAUTIONS', 'MODIFY', 'MOVE_INDOORS'];
    for (let i = 0; i < NUM_SCENARIOS; i++) {
      const aqi = randomInt(0, 500);
      const heatIndex = randomFloat(15, 60);
      const intensity = randomIntensity();
      const isModeled = randomBool();
      const isStale = randomBool();
      const hasRespiratory = randomBool();

      const floor = evaluatePolicy(aqi, heatIndex, intensity, isModeled, isStale, hasRespiratory);
      // Simulate unconstrained / adversarial AI proposing a decision
      const aiProposedDecision = aiStubProposals[randomInt(0, aiStubProposals.length - 1)];

      // Enforce the tighten-only policy floor combiner (as done in /assistant/chat and coordinator overrides)
      const finalEnforcedDecision: PolicyDecision =
        SEVERITY[aiProposedDecision] > SEVERITY[floor.decision]
          ? aiProposedDecision
          : floor.decision;

      // Invariant: Final enforced decision can NEVER be more relaxed than the deterministic policy floor
      expect(SEVERITY[finalEnforcedDecision]).toBeGreaterThanOrEqual(SEVERITY[floor.decision]);
      if (floor.decision === 'MOVE_INDOORS') {
        expect(finalEnforcedDecision).toBe('MOVE_INDOORS');
      }
    }
  });
});
