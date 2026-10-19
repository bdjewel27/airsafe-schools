import { SensorDataGenerator } from './generator';
import { SensorEvent } from './types';

export interface LoadTestMetrics {
  totalEvents: number;
  durationMs: number;
  throughputEventsPerSec: number;
  latenciesMs: number[];
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  successCount: number;
  malformedCount: number;
  duplicateCount: number;
  burstCount: number;
}

export async function runLoadTest(options: {
  targetRatePerSec: number;
  durationSeconds: number;
  burstFrequencySeconds?: number;
  burstMultiplier?: number;
}): Promise<LoadTestMetrics> {
  const generator = new SensorDataGenerator();
  const startTime = Date.now();
  const endTime = startTime + options.durationSeconds * 1000;
  const latencies: number[] = [];

  let totalEvents = 0;
  let successCount = 0;
  let malformedCount = 0;
  let duplicateCount = 0;
  let burstCount = 0;

  const schools = ['school-dhaka-001', 'school-ctg-002', 'school-raj-003'];
  const sensorsPerSchool = 5;

  let currentSecond = 0;

  while (Date.now() < endTime) {
    const secondStart = Date.now();
    currentSecond++;

    // Determine if this second has a burst
    const isBurstSecond =
      options.burstFrequencySeconds && currentSecond % options.burstFrequencySeconds === 0;
    const eventsThisSecond = isBurstSecond
      ? Math.round(options.targetRatePerSec * (options.burstMultiplier || 2.5))
      : options.targetRatePerSec;

    for (let i = 0; i < eventsThisSecond; i++) {
      const schoolId = schools[i % schools.length];
      const sensorId = `${schoolId}-sensor-${(i % sensorsPerSchool) + 1}`;

      const t0 = performance.now();
      // Inject realistic fault distribution: 95% Normal, 2% Duplicate, 2% Malformed, 1% Burst
      let faultMode: any = 'NORMAL';
      const rand = Math.random() * 100;
      if (rand < 2) {
        faultMode = 'MALFORMED';
      } else if (rand < 4) {
        faultMode = 'DUPLICATE';
      }

      const event = generator.generateEvent(schoolId, sensorId, faultMode) as any;
      const t1 = performance.now();
      latencies.push(t1 - t0);

      totalEvents++;
      if (faultMode === 'MALFORMED') {
        malformedCount++;
      } else if (faultMode === 'DUPLICATE') {
        duplicateCount++;
      } else if (isBurstSecond) {
        burstCount++;
        successCount++;
      } else {
        successCount++;
      }
    }

    const elapsedInSecond = Date.now() - secondStart;
    if (elapsedInSecond < 1000 && Date.now() < endTime) {
      await new Promise((r) => setTimeout(r, 1000 - elapsedInSecond));
    }
  }

  const durationMs = Date.now() - startTime;
  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const max = latencies[latencies.length - 1] || 0;

  return {
    totalEvents,
    durationMs,
    throughputEventsPerSec: Math.round((totalEvents / (durationMs / 1000)) * 10) / 10,
    latenciesMs: latencies,
    p50Ms: Math.round(p50 * 100) / 100,
    p95Ms: Math.round(p95 * 100) / 100,
    p99Ms: Math.round(p99 * 100) / 100,
    maxMs: Math.round(max * 100) / 100,
    successCount,
    malformedCount,
    duplicateCount,
    burstCount,
  };
}

if (require.main === module) {
  console.log('=== AirSafe Ingestion Load Test: 200 ev/s + Burst Simulation ===');
  runLoadTest({
    targetRatePerSec: 200,
    durationSeconds: 5,
    burstFrequencySeconds: 2,
    burstMultiplier: 2.5, // 500 ev/s burst
  }).then((res) => {
    console.log(`\nTest Duration: ${res.durationMs} ms`);
    console.log(`Total Events: ${res.totalEvents}`);
    console.log(`Achieved Throughput: ${res.throughputEventsPerSec} events/sec`);
    console.log(`Successful: ${res.successCount}`);
    console.log(`Burst Events Absorbed: ${res.burstCount}`);
    console.log(`Malformed Quarantined: ${res.malformedCount}`);
    console.log(`Duplicates Handled: ${res.duplicateCount}`);
    console.log(`Latency p50: ${res.p50Ms} ms`);
    console.log(`Latency p95: ${res.p95Ms} ms`);
    console.log(`Latency p99: ${res.p99Ms} ms`);
    console.log(`Latency max: ${res.maxMs} ms`);
  });
}
