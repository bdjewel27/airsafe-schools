import { evaluatePolicy, evaluateAQIDecision, evaluateHeatDecision, calculateAqiFromPm25 } from '../policy';
import { calculateHeatIndex } from '../heatindex';

describe('Model School Outdoor Activity Policy v1.2 Tests', () => {
  describe('AQI Boundaries (US AQI)', () => {
    test('AQI 50 (Good) -> PROCEED for all intensities', () => {
      expect(evaluateAQIDecision(50, 'LIGHT').decision).toBe('PROCEED');
      expect(evaluateAQIDecision(50, 'MODERATE').decision).toBe('PROCEED');
      expect(evaluateAQIDecision(50, 'VIGOROUS').decision).toBe('PROCEED');
    });

    test('AQI 51 & 100 (Moderate) -> PROCEED_WITH_PRECAUTIONS only for Vigorous', () => {
      expect(evaluateAQIDecision(100, 'LIGHT').decision).toBe('PROCEED');
      expect(evaluateAQIDecision(100, 'MODERATE').decision).toBe('PROCEED');
      expect(evaluateAQIDecision(100, 'VIGOROUS').decision).toBe('PROCEED_WITH_PRECAUTIONS');
    });

    test('AQI 101 (Unhealthy for Sensitive Groups) -> boundary switch', () => {
      expect(evaluateAQIDecision(101, 'LIGHT').decision).toBe('PROCEED_WITH_PRECAUTIONS');
      expect(evaluateAQIDecision(101, 'MODERATE').decision).toBe('PROCEED_WITH_PRECAUTIONS');
      const vig = evaluateAQIDecision(101, 'VIGOROUS');
      expect(vig.decision).toBe('MODIFY');
      expect(vig.maxMinutes).toBe(30);
    });

    test('AQI 151 (Unhealthy) -> boundary switch to MOVE_INDOORS for Vigorous', () => {
      expect(evaluateAQIDecision(151, 'LIGHT').decision).toBe('MODIFY');
      expect(evaluateAQIDecision(151, 'MODERATE').decision).toBe('MODIFY');
      expect(evaluateAQIDecision(151, 'VIGOROUS').decision).toBe('MOVE_INDOORS');
    });

    test('AQI 201+ (Very Unhealthy / Hazardous) -> MOVE_INDOORS for all', () => {
      expect(evaluateAQIDecision(205, 'LIGHT').decision).toBe('MOVE_INDOORS');
      expect(evaluateAQIDecision(205, 'MODERATE').decision).toBe('MOVE_INDOORS');
      expect(evaluateAQIDecision(205, 'VIGOROUS').decision).toBe('MOVE_INDOORS');
    });
  });

  describe('Heat Index Boundaries (°C)', () => {
    test('Heat Index < 27°C -> PROCEED for all', () => {
      expect(evaluateHeatDecision(26.5, 'VIGOROUS').decision).toBe('PROCEED');
    });

    test('Heat Index 27 - < 32°C (Caution) -> PROCEED_WITH_PRECAUTIONS for Mod & Vig', () => {
      expect(evaluateHeatDecision(27.0, 'LIGHT').decision).toBe('PROCEED');
      expect(evaluateHeatDecision(31.9, 'MODERATE').decision).toBe('PROCEED_WITH_PRECAUTIONS');
      expect(evaluateHeatDecision(31.9, 'VIGOROUS').decision).toBe('PROCEED_WITH_PRECAUTIONS');
    });

    test('Heat Index 32 - < 39°C (Extreme Caution) -> MODIFY for Mod & Vig with shade', () => {
      const res = evaluateHeatDecision(35.0, 'VIGOROUS');
      expect(res.decision).toBe('MODIFY');
      expect(res.maxMinutes).toBe(30);
      expect(res.requiresShade).toBe(true);
    });

    test('Heat Index 39 - < 51°C (Danger) -> MOVE_INDOORS for Mod & Vig', () => {
      expect(evaluateHeatDecision(39.1, 'LIGHT').decision).toBe('MODIFY');
      expect(evaluateHeatDecision(39.1, 'MODERATE').decision).toBe('MOVE_INDOORS');
      expect(evaluateHeatDecision(39.1, 'VIGOROUS').decision).toBe('MOVE_INDOORS');
    });

    test('Heat Index >= 51°C (Extreme Danger) -> MOVE_INDOORS for all', () => {
      expect(evaluateHeatDecision(51.0, 'LIGHT').decision).toBe('MOVE_INDOORS');
      expect(evaluateHeatDecision(52.0, 'VIGOROUS').decision).toBe('MOVE_INDOORS');
    });
  });

  describe('Policy General Rules (Strictest Outcome & Modeled/Stale Caps)', () => {
    test('Takes the stricter of Heat and AQI', () => {
      // AQI is Good (PROCEED), but Heat is Dangerous (MOVE_INDOORS)
      const res = evaluatePolicy(35, 42.0, 'VIGOROUS');
      expect(res.decision).toBe('MOVE_INDOORS');
    });

    test('Rule 3: Modeled data floor cannot be better than PROCEED_WITH_PRECAUTIONS', () => {
      // Both AQI & Heat are pristine (PROCEED), but data is modeled
      const res = evaluatePolicy(20, 24.0, 'LIGHT', true /* isModeled */);
      expect(res.decision).toBe('PROCEED_WITH_PRECAUTIONS');
      expect(res.reasons).toContain('Data is modeled: capped at PROCEED_WITH_PRECAUTIONS');
    });

    test('Rule 4: Stale data (>90m) floor cannot be better than PROCEED_WITH_PRECAUTIONS', () => {
      const res = evaluatePolicy(20, 24.0, 'LIGHT', false, true /* isStale */);
      expect(res.decision).toBe('PROCEED_WITH_PRECAUTIONS');
      expect(res.reasons).toContain('Data is older than 90 mins: capped at PROCEED_WITH_PRECAUTIONS');
    });
  });

  describe('Heat Index NOAA Rothfusz Regression', () => {
    test('Calculates heat index accurately for typical Dhaka summer (34°C, 75% RH)', () => {
      const hi = calculateHeatIndex(34, 75);
      // High humidity at 34C pushes perceived temperature above 45C
      expect(hi).toBeGreaterThan(45);
      expect(hi).toBeLessThan(55);
    });
  });

  describe('Policy Gaps Fixes (P-2, P-3, P-4)', () => {
    test('P-2: Mandatory shade when decision is MODIFY even if heat index is mild (<27°C)', () => {
      // AQI 120 with VIGOROUS -> MODIFY, heat index 22C (normally requiresShade=false)
      const res = evaluatePolicy(120, 22.0, 'VIGOROUS');
      expect(res.decision).toBe('MODIFY');
      expect(res.requiresShade).toBe(true);
    });

    test('P-3: Respiratory condition steps up AQI category by one tier', () => {
      // Pristine AQI 40 with VIGOROUS is normally PROCEED
      const normalRes = evaluatePolicy(40, 24.0, 'VIGOROUS', false, false, false);
      expect(normalRes.decision).toBe('PROCEED');

      // With respiratory condition, AQI 40 is stepped up to 51-100 tier -> PROCEED_WITH_PRECAUTIONS
      const asthmaRes = evaluatePolicy(40, 24.0, 'VIGOROUS', false, false, true);
      expect(asthmaRes.decision).toBe('PROCEED_WITH_PRECAUTIONS');
      expect(asthmaRes.reasonCodes).toContain('RESPIRATORY_CONDITION_STEPPED_UP');
    });

    test('P-4: Non-finite input guard fails closed to MOVE_INDOORS with INVALID_SENSOR_INPUT', () => {
      const nanAqi = evaluatePolicy(NaN, 30.0, 'MODERATE');
      expect(nanAqi.decision).toBe('MOVE_INDOORS');
      expect(nanAqi.reasonCodes).toContain('INVALID_SENSOR_INPUT');

      const nanHeat = evaluatePolicy(50, NaN, 'LIGHT');
      expect(nanHeat.decision).toBe('MOVE_INDOORS');
      expect(nanHeat.reasonCodes).toContain('INVALID_SENSOR_INPUT');
    });
  });
describe('US EPA PM2.5 to AQI Piecewise-Linear Calculation (P1 Fix)', () => {
    test('Calculates AQI 50 at PM2.5 = 9.0 ug/m3', () => {
      expect(calculateAqiFromPm25(9.0)).toBe(50);
    });

    test('Calculates AQI 100 at PM2.5 = 35.4 ug/m3', () => {
      expect(calculateAqiFromPm25(35.4)).toBe(100);
    });

    test('Calculates AQI 150 at PM2.5 = 55.4 ug/m3', () => {
      expect(calculateAqiFromPm25(55.4)).toBe(150);
    });

    test('Calculates AQI ~152 at PM2.5 = 58.2 ug/m3 and enforces MOVE_INDOORS for vigorous activity', () => {
      const aqi = calculateAqiFromPm25(58.2);
      expect(aqi).toBe(152);
      const evalResult = evaluatePolicy(aqi, 25.0, 'VIGOROUS');
      expect(evalResult.decision).toBe('MOVE_INDOORS');
    });

    test('Gracefully handles edge cases and extremes', () => {
      expect(calculateAqiFromPm25(0)).toBe(0);
      expect(calculateAqiFromPm25(-5)).toBe(0);
      expect(calculateAqiFromPm25(500.4)).toBe(500);
      expect(calculateAqiFromPm25(600)).toBe(500);
      expect(calculateAqiFromPm25(NaN)).toBe(0);
    });
  });
});
