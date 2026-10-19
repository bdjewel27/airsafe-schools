import { runLoadTest } from '../loadTest';

describe('Ingestion Pipeline Load Test (200 ev/s & Burst)', () => {
  test('sustains target rate of >= 200 ev/s and absorbs burst spikes', async () => {
    const res = await runLoadTest({
      targetRatePerSec: 200,
      durationSeconds: 2,
      burstFrequencySeconds: 1,
      burstMultiplier: 2.0, // Burst to 400 ev/s
    });

    expect(res.totalEvents).toBeGreaterThanOrEqual(400);
    expect(res.throughputEventsPerSec).toBeGreaterThanOrEqual(180); // within tolerance
    expect(res.p95Ms).toBeLessThan(10); // sub-10ms event generation
    expect(res.burstCount).toBeGreaterThan(0);
    expect(res.totalEvents).toBe(res.successCount + res.malformedCount + res.duplicateCount);
  }, 10000);
});
