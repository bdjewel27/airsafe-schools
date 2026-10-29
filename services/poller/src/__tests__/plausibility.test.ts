import {
  performDeltaCheck,
  classifyAnomalyHeuristic,
  classifyAnomalyWithNovaMicro,
  SensorTelemetryInput,
} from '../plausibility';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

describe('F-23: Sensor Delta Check & Bedrock Nova Micro Anomaly Plausibility', () => {
  const baseTime = '2026-10-26T10:00:00Z';
  const nextTime = '2026-10-26T10:15:00Z'; // 15 mins later

  test('normal reading within physical bounds and delta limits passes with isAnomalous=false', () => {
    const prior: SensorTelemetryInput = {
      temp_c: 28.5,
      rh_pct: 65.0,
      pm25_ugm3: 35.0,
      ts: baseTime,
    };
    const current: SensorTelemetryInput = {
      temp_c: 29.0,
      rh_pct: 63.0,
      pm25_ugm3: 38.0,
      ts: nextTime,
    };
    const districtBaseline = { temp_c: 28.8, rh_pct: 64.0, pm25_ugm3: 36.0 };

    const result = performDeltaCheck(current, prior, districtBaseline);
    expect(result.isAnomalous).toBe(false);
    expect(result.flags).toHaveLength(0);
    expect(result.deltas.tempDeltaC).toBe(0.5);
    expect(result.deltas.pm25DeltaUgm3).toBe(3.0);
  });

  test('flags temperature rate of change exceeding 5°C/hr threshold', () => {
    const prior: SensorTelemetryInput = {
      temp_c: 28.0,
      rh_pct: 60.0,
      pm25_ugm3: 30.0,
      ts: baseTime,
    };
    // 3.0°C jump in 15 minutes equates to 12.0°C/hr (exceeds max 5°C/hr)
    const current: SensorTelemetryInput = {
      temp_c: 31.0,
      rh_pct: 58.0,
      pm25_ugm3: 32.0,
      ts: nextTime,
    };

    const result = performDeltaCheck(current, prior);
    expect(result.isAnomalous).toBe(true);
    expect(result.flags).toContain('EXCESSIVE_TEMP_DELTA_RATE');
  });

  test('flags sudden PM2.5 spike > 50 µg/m³ within 15 minutes', () => {
    const prior: SensorTelemetryInput = {
      temp_c: 30.0,
      rh_pct: 65.0,
      pm25_ugm3: 25.0,
      ts: baseTime,
    };
    // PM2.5 jumps by 85 µg/m³ in 15 mins (e.g. nearby biomass burning or plume)
    const current: SensorTelemetryInput = {
      temp_c: 30.2,
      rh_pct: 64.0,
      pm25_ugm3: 110.0,
      ts: nextTime,
    };

    const result = performDeltaCheck(current, prior);
    expect(result.isAnomalous).toBe(true);
    expect(result.flags).toContain('PM25_SUDDEN_SPIKE');
  });

  test('flags readings exceeding physical plausibility bounds', () => {
    const current: SensorTelemetryInput = {
      temp_c: 55.0, // Above 50°C
      rh_pct: 105.0, // Above 100%
      pm25_ugm3: -5.0, // Negative PM2.5
      ts: nextTime,
    };

    const result = performDeltaCheck(current, null);
    expect(result.isAnomalous).toBe(true);
    expect(result.flags).toContain('TEMP_OUT_OF_BOUNDS');
    expect(result.flags).toContain('RH_OUT_OF_BOUNDS');
    expect(result.flags).toContain('PM25_OUT_OF_BOUNDS');
  });

  test('flags regional divergence when campus sensor deviates >4x from district station baseline', () => {
    const current: SensorTelemetryInput = {
      temp_c: 31.0,
      rh_pct: 60.0,
      pm25_ugm3: 200.0, // Campus reads 200 µg/m³
      ts: nextTime,
    };
    const districtBaseline = { temp_c: 30.5, rh_pct: 62.0, pm25_ugm3: 40.0 }; // District reads 40 µg/m³

    const result = performDeltaCheck(current, null, districtBaseline);
    expect(result.isAnomalous).toBe(true);
    expect(result.flags).toContain('DISTRICT_BASELINE_DIVERGENCE');
  });

  test('classifies impossible hardware reading as SENSOR_MALFUNCTION', () => {
    const current: SensorTelemetryInput = {
      temp_c: 65.0,
      rh_pct: 110.0,
      pm25_ugm3: -10.0,
      ts: nextTime,
    };
    const flags = ['TEMP_OUT_OF_BOUNDS', 'RH_OUT_OF_BOUNDS', 'PM25_OUT_OF_BOUNDS'];

    const classification = classifyAnomalyHeuristic(current, flags);
    expect(classification.category).toBe('SENSOR_MALFUNCTION');
    expect(classification.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test('classifies localized particulate spike as LOCALIZED_EVENT (e.g. nearby smoke plume)', () => {
    const current: SensorTelemetryInput = {
      temp_c: 30.0,
      rh_pct: 60.0,
      pm25_ugm3: 150.0,
      ts: nextTime,
    };
    const flags = ['PM25_SUDDEN_SPIKE', 'DISTRICT_BASELINE_DIVERGENCE'];

    const classification = classifyAnomalyHeuristic(current, flags);
    expect(classification.category).toBe('LOCALIZED_EVENT');
    expect(classification.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test('classifies rapid weather front as PLAUSIBLE_WEATHER_EVENT', () => {
    const current: SensorTelemetryInput = {
      temp_c: 24.0,
      rh_pct: 95.0,
      pm25_ugm3: 20.0,
      ts: nextTime,
    };
    const flags = ['EXCESSIVE_TEMP_DELTA_RATE', 'RH_SUDDEN_SHIFT'];

    const classification = classifyAnomalyHeuristic(current, flags);
    expect(classification.category).toBe('PLAUSIBLE_WEATHER_EVENT');
    expect(classification.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test('classifyAnomalyWithNovaMicro calls Bedrock ConverseCommand with amazon.nova-micro-v1:0', async () => {
    const mockSend = jest.fn().mockResolvedValue({
      output: {
        message: {
          content: [
            {
              text: JSON.stringify({
                category: 'LOCALIZED_EVENT',
                confidence: 0.94,
                explanation: 'Sudden PM2.5 rise while meteorological parameters remain stable is characteristic of localized burning.',
              }),
            },
          ],
        },
      },
    });

    const mockBedrockClient = {
      send: mockSend,
    } as unknown as BedrockRuntimeClient;

    const current: SensorTelemetryInput = {
      temp_c: 31.0,
      rh_pct: 60.0,
      pm25_ugm3: 120.0,
      ts: nextTime,
    };

    const result = await classifyAnomalyWithNovaMicro({
      current,
      flags: ['PM25_SUDDEN_SPIKE'],
      deltas: { pm25DeltaUgm3: 70.0, elapsedMinutes: 15 },
      bedrockClient: mockBedrockClient,
      modelId: 'amazon.nova-micro-v1:0',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.modelId).toBe('amazon.nova-micro-v1:0');
    expect(result.category).toBe('LOCALIZED_EVENT');
    expect(result.confidence).toBe(0.94);
    expect(result.explanation).toContain('localized burning');
    expect(result.model).toBe('amazon.nova-micro-v1:0');
  });
});
