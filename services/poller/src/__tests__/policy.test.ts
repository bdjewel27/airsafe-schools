import {
  evaluatePolicy,
  evaluateAQIDecision,
  evaluateHeatDecision,
  calculateAqiFromPm25,
  getActivePolicyConfig,
  registerPolicyConfig,
  getAllPolicyConfigs,
  PolicyConfig
} from '../policy';
import { calculateHeatIndex } from '../heatindex';
import { resolveTelemetryWithProvenance } from '../index';

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

    test('P5: Non-finite input guard fails closed to UNKNOWN with INVALID_SENSOR_INPUT per Policy v1.2 §4', () => {
      const nanAqi = evaluatePolicy(NaN, 30.0, 'MODERATE');
      expect(nanAqi.decision).toBe('UNKNOWN');
      expect(nanAqi.reasonCodes).toContain('INVALID_SENSOR_INPUT');

      const nanHeat = evaluatePolicy(50, NaN, 'LIGHT');
      expect(nanHeat.decision).toBe('UNKNOWN');
      expect(nanHeat.reasonCodes).toContain('INVALID_SENSOR_INPUT');

      const infAqi = evaluatePolicy(Infinity, 30.0, 'MODERATE');
      expect(infAqi.decision).toBe('UNKNOWN');
      expect(infAqi.reasonCodes).toContain('INVALID_SENSOR_INPUT');

      const infHeat = evaluatePolicy(45, -Infinity, 'VIGOROUS');
      expect(infHeat.decision).toBe('UNKNOWN');
      expect(infHeat.reasonCodes).toContain('INVALID_SENSOR_INPUT');
    });
  });
describe('US EPA PM2.5 to AQI Piecewise-Linear Calculation (P1 Fix — Table-Driven EPA Examples)', () => {
    const epaPublishedTable: Array<{
      pm25: number;
      expectedAqi: number;
      category: string;
      expectedVigorous: string;
    }> = [
      { pm25: 0.0,   expectedAqi: 0,   category: 'Good (Lower)',                      expectedVigorous: 'PROCEED' },
      { pm25: 4.5,   expectedAqi: 25,  category: 'Good (Midpoint)',                   expectedVigorous: 'PROCEED' },
      { pm25: 9.0,   expectedAqi: 50,  category: 'Good (Upper Breakpoint)',           expectedVigorous: 'PROCEED' },
      { pm25: 9.1,   expectedAqi: 51,  category: 'Moderate (Lower Breakpoint)',       expectedVigorous: 'PROCEED_WITH_PRECAUTIONS' },
      { pm25: 22.2,  expectedAqi: 75,  category: 'Moderate (Midpoint)',               expectedVigorous: 'PROCEED_WITH_PRECAUTIONS' },
      { pm25: 35.4,  expectedAqi: 100, category: 'Moderate (Upper Breakpoint)',       expectedVigorous: 'PROCEED_WITH_PRECAUTIONS' },
      { pm25: 35.5,  expectedAqi: 101, category: 'USG (Lower Breakpoint)',            expectedVigorous: 'MODIFY' },
      { pm25: 45.5,  expectedAqi: 126, category: 'USG (Midpoint)',                    expectedVigorous: 'MODIFY' },
      { pm25: 55.4,  expectedAqi: 150, category: 'USG (Upper Breakpoint)',            expectedVigorous: 'MODIFY' },
      { pm25: 55.5,  expectedAqi: 151, category: 'Unhealthy (Lower Breakpoint)',      expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 58.2,  expectedAqi: 152, category: 'Appendix B Example (58.2 ug/m3)',   expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 102.9, expectedAqi: 175, category: 'Unhealthy (Midpoint)',              expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 150.4, expectedAqi: 200, category: 'Unhealthy (Upper Breakpoint)',      expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 150.5, expectedAqi: 201, category: 'Very Unhealthy (Lower Breakpoint)', expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 200.4, expectedAqi: 250, category: 'Very Unhealthy (Midpoint)',         expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 250.4, expectedAqi: 300, category: 'Very Unhealthy (Upper Breakpoint)', expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 250.5, expectedAqi: 301, category: 'Hazardous Tier 1 (Lower)',          expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 350.4, expectedAqi: 400, category: 'Hazardous Tier 1 (Upper)',          expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 350.5, expectedAqi: 401, category: 'Hazardous Tier 2 (Lower)',          expectedVigorous: 'MOVE_INDOORS' },
      { pm25: 500.4, expectedAqi: 500, category: 'Hazardous Tier 2 (Upper Cap)',      expectedVigorous: 'MOVE_INDOORS' },
    ];

    test.each(epaPublishedTable)(
      'EPA Example: PM2.5 $pm25 ug/m3 ($category) -> AQI $expectedAqi -> Vigorous: $expectedVigorous',
      ({ pm25, expectedAqi, expectedVigorous }) => {
        const aqi = calculateAqiFromPm25(pm25);
        expect(aqi).toBe(expectedAqi);
        const evalResult = evaluatePolicy(aqi, 24.0, 'VIGOROUS');
        expect(evalResult.decision).toBe(expectedVigorous);
      }
    );

    test('Gracefully handles edge cases and extremes', () => {
      expect(calculateAqiFromPm25(0)).toBe(0);
      expect(calculateAqiFromPm25(-5)).toBe(0);
      expect(calculateAqiFromPm25(500.4)).toBe(500);
      expect(calculateAqiFromPm25(600)).toBe(500);
      expect(calculateAqiFromPm25(NaN)).toBe(0);
    });
  });

  describe('Finding S9: Multi-Version & Effective-From Resolution', () => {
    test('Resolves v1.2 configuration before effective date 2026-11-01', () => {
      const active = getActivePolicyConfig('2026-10-25');
      expect(active.version).toBe('v1.2');
      expect(active.effective_from).toBe('2026-10-01');

      const result = evaluatePolicy(75, 28, 'MODERATE', false, false, false, '2026-10-25');
      expect(result.policyVersion).toBe('v1.2');
    });

    test('Automatically transitions to v1.3 configuration on or after 2026-11-01', () => {
      const active = getActivePolicyConfig('2026-11-01');
      expect(active.version).toBe('v1.3');
      expect(active.effective_from).toBe('2026-11-01');

      const activeFuture = getActivePolicyConfig('2026-12-15');
      expect(activeFuture.version).toBe('v1.3');

      const result = evaluatePolicy(75, 28, 'MODERATE', false, false, false, '2026-11-05');
      expect(result.policyVersion).toBe('v1.3');
    });

    test('Allows runtime hydration (e.g. from S3) without code redeployment', () => {
      const s3HydratedPolicy: PolicyConfig = {
        version: 'v1.4',
        name: 'Model School Outdoor Activity Policy v1.4 (S3 Hydrated)',
        effectiveDate: '2026-12-01',
        effective_from: '2026-12-01',
        authority: 'AirSafe Environmental Taskforce',
        aqiBands: [
          { max: 50, code: 'GOOD', defaultDecision: 'PROCEED', vigorousDecision: 'PROCEED' },
          { max: 100, code: 'MODERATE', defaultDecision: 'PROCEED', vigorousDecision: 'PROCEED_WITH_PRECAUTIONS' },
          { max: 150, code: 'USG', defaultDecision: 'PROCEED_WITH_PRECAUTIONS', vigorousDecision: 'MODIFY', vigorousMaxMinutes: 30 },
          { max: 200, code: 'UNHEALTHY', defaultDecision: 'MODIFY', vigorousDecision: 'MOVE_INDOORS', defaultMaxMinutes: 30 },
          { max: 500, code: 'HAZARDOUS', defaultDecision: 'MOVE_INDOORS', vigorousDecision: 'MOVE_INDOORS' }
        ],
        heatBands: [
          { max: 27, code: 'NORMAL', lightDecision: 'PROCEED', defaultDecision: 'PROCEED', requiresShade: false },
          { max: 32, code: 'CAUTION', lightDecision: 'PROCEED', defaultDecision: 'PROCEED_WITH_PRECAUTIONS', requiresShade: false },
          { max: 39, code: 'EXTREME_CAUTION', lightDecision: 'PROCEED_WITH_PRECAUTIONS', defaultDecision: 'MODIFY', defaultMaxMinutes: 30, requiresShade: true },
          { max: 51, code: 'DANGER', lightDecision: 'MODIFY', defaultDecision: 'MOVE_INDOORS', lightMaxMinutes: 30, requiresShade: true }
        ],
        pm25Breakpoints: [
          { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
          { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
          { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
          { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
          { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
          { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
          { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 }
        ]
      };

      registerPolicyConfig(s3HydratedPolicy);
      const allConfigs = getAllPolicyConfigs();
      expect(allConfigs.some(c => c.version === 'v1.4')).toBe(true);

      expect(getActivePolicyConfig('2026-11-15').version).toBe('v1.3');

      const activeDec = getActivePolicyConfig('2026-12-05');
      expect(activeDec.version).toBe('v1.4');

      const evalDec = evaluatePolicy(60, 26, 'LIGHT', false, false, false, '2026-12-05');
      expect(evalDec.policyVersion).toBe('v1.4');
    });
  });

  describe('Finding P3: Policy Rule 3 - Measured vs Modeled Priority & Source Provenance', () => {
    test('Prioritizes measured OpenAQ PM2.5 to calculate AQI over Open-Meteo modeled AQI and preserves separate provenance', () => {
      const fetchedAt = '2026-10-25T18:00:00.000Z';
      const resolved = resolveTelemetryWithProvenance({
        openAqReadings: [
          {
            sensorId: 'openaq-8118',
            locationId: 8118,
            locationName: 'US Diplomatic Post: Dhaka',
            pm25: 58.2, // EPA AQI = 152 (UNHEALTHY)
            timestamp: '2026-10-25T17:45:00.000Z',
            isModeled: false,
          },
        ],
        meteo: {
          temperatureC: 31.0,
          relativeHumidityPct: 68,
          apparentTemperatureC: 35.2,
          pm25: 22.0,
          usAqi: 65, // Modeled AQI is only 65 (MODERATE)
          timestamp: '2026-10-25T17:50:00.000Z',
          isModeled: true,
        },
        fetchedAt,
      });

      // Must compute AQI strictly from measured OpenAQ PM2.5 (58.2 -> 152), NOT Open-Meteo's 65
      expect(resolved.pm25).toBe(58.2);
      expect(resolved.aqi).toBe(152);
      expect(resolved.airQualityIsModeled).toBe(false);
      expect(resolved.weatherIsModeled).toBe(true);
      expect(resolved.isModeled).toBe(false);

      // Verify structured provenance for air quality (measured) vs weather (modeled)
      expect(resolved.provenance.air_quality.source).toBe('OpenAQ (measured)');
      expect(resolved.provenance.air_quality.is_modeled).toBe(false);
      expect(resolved.provenance.air_quality.observed_at).toBe('2026-10-25T17:45:00.000Z');
      expect(resolved.provenance.air_quality.fetched_at).toBe(fetchedAt);
      expect(resolved.provenance.air_quality.values.aqi).toBe(152);

      expect(resolved.provenance.weather.source).toBe('Open-Meteo (modeled)');
      expect(resolved.provenance.weather.is_modeled).toBe(true);
      expect(resolved.provenance.weather.observed_at).toBe('2026-10-25T17:50:00.000Z');

      // Verify both raw sources are retained separately
      expect(resolved.provenance.sources_raw.openaq_measured?.aqi).toBe(152);
      expect(resolved.provenance.sources_raw.openaq_measured?.is_modeled).toBe(false);
      expect(resolved.provenance.sources_raw.open_meteo_modeled?.aqi).toBe(65);
      expect(resolved.provenance.sources_raw.open_meteo_modeled?.is_modeled).toBe(true);
    });

    test('Falls back to Open-Meteo modeled AQI and marks is_modeled=true when OpenAQ is unavailable', () => {
      const fetchedAt = '2026-10-25T18:00:00.000Z';
      const resolved = resolveTelemetryWithProvenance({
        openAqReadings: [],
        meteo: {
          temperatureC: 29.0,
          relativeHumidityPct: 60,
          apparentTemperatureC: 31.0,
          pm25: 35.4,
          usAqi: 100,
          timestamp: '2026-10-25T17:55:00.000Z',
          isModeled: true,
        },
        fetchedAt,
      });

      expect(resolved.pm25).toBe(35.4);
      expect(resolved.aqi).toBe(100);
      expect(resolved.airQualityIsModeled).toBe(true);
      expect(resolved.isModeled).toBe(true);
      expect(resolved.provenance.air_quality.source).toBe('Open-Meteo (modeled)');
      expect(resolved.provenance.air_quality.is_modeled).toBe(true);
      expect(resolved.provenance.sources_raw.openaq_measured).toBeNull();
      expect(resolved.provenance.sources_raw.open_meteo_modeled?.aqi).toBe(100);
    });
  });
});
