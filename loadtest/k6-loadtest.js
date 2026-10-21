import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const failureRate = new Rate('telemetry_failed_rate');
const latencyTrend = new Trend('telemetry_processing_latency_ms');

// Performance test configuration matching AirSafe Rubric:
// - 200 events/sec sustained
// - 500 events/sec burst surges
export const options = {
  scenarios: {
    // 1. Warm-up phase: 10s at 20 RPS
    warmup: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 10,
      maxVUs: 50,
      exec: 'telemetryIngest',
    },
    // 2. Sustained phase: 30s at 200 RPS (Target benchmark)
    sustained_load: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      startTime: '10s',
      exec: 'telemetryIngest',
    },
    // 3. Peak Burst Surge: 10s at 500 RPS (2.5x burst spike)
    peak_burst_surge: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 100,
      maxVUs: 400,
      startTime: '40s',
      exec: 'telemetryIngest',
    },
    // 4. Recovery phase: 15s back to 200 RPS
    recovery_load: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '15s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      startTime: '50s',
      exec: 'telemetryIngest',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<250', 'p(99)<500'], // 95% of requests must complete within 250ms
    'telemetry_failed_rate': ['rate<0.01'],            // Failure rate strictly below 1%
    'http_req_failed': ['rate<0.01'],                 // HTTP failures below 1%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const SCHOOLS = ['school-dhaka-001', 'school-ctg-002', 'school-raj-003'];
const LOCATIONS = ['FIELD', 'COURTYARD', 'CLASSROOM'];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function telemetryIngest() {
  const schoolId = getRandomElement(SCHOOLS);
  const location = getRandomElement(LOCATIONS);

  // Generate realistic sensor telemetry
  const payload = JSON.stringify({
    school_id: schoolId,
    sensor_id: `sensor-${location.toLowerCase()}-01`,
    location_type: location,
    pm25: parseFloat((25 + Math.random() * 80).toFixed(1)),
    co2: Math.floor(400 + Math.random() * 600),
    temperature: parseFloat((28 + Math.random() * 8).toFixed(1)),
    humidity: Math.floor(55 + Math.random() * 30),
    timestamp: new Date().toISOString(),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'X-AirSafe-Source': 'simulator-loadtest',
    },
    timeout: '5s',
  };

  const res = http.post(`${BASE_URL}/telemetry`, payload, params);

  const isSuccess = check(res, {
    'status is 200 or 202': (r) => r.status === 200 || r.status === 202,
  });

  failureRate.add(!isSuccess);
  latencyTrend.add(res.timings.duration);
}
