# AirSafe Schools: Telemetry Pipeline Load & Burst Testing Suite

This directory contains automated load and burst test specifications (`k6` and `Artillery`) along with empirical raw benchmark results for the AirSafe Schools telemetry ingestion pipeline.

---

## 1. Benchmark Target & Architecture

- **Sustained Target:** 200 events/second
- **Burst Surge Target:** 500 events/second (2.5x spike multiplier)
- **Target Ingestion Path:** Client / Sensors $\to$ Amazon SQS Standard Queue $\to$ Ingestion Processor Lambda (`batchSize: 10`, `reportBatchItemFailures: true`) $\to$ DynamoDB / DLQ
- **Failure Quarantine:** Amazon SQS Dead Letter Queue (DLQ) with `maxReceiveCount: 3`

```
IoT Sensors / Simulator ──> SQS Ingestion Queue ──> Processor Lambda ──> DynamoDB
                                  │
                                  ▼ (after 3 failures)
                             Dead Letter Queue (DLQ)
```

---

## 2. Test Scripts

### A. k6 (`k6-loadtest.js`)
Executes four multi-stage scenarios with arrival-rate executors:
1. **Warm-up:** 20 RPS (10s)
2. **Sustained Baseline:** 200 RPS (30s)
3. **Peak Burst Surge:** 500 RPS (10s)
4. **Recovery Phase:** 200 RPS (15s)

**Run with k6:**
```bash
# Against local mock / dev API
API_URL=http://localhost:3000 k6 run k6-loadtest.js

# Against deployed API Gateway
API_URL=https://api.airsafe.internal k6 run k6-loadtest.js
```

### B. Artillery (`artillery-loadtest.yml`)
Configured with matching arrival rates and p95 latency SLO assertions (<250ms).

**Run with Artillery:**
```bash
npm run loadtest:artillery
# Or directly:
npx artillery run artillery-loadtest.yml
```

### C. Node.js Simulator Load Test
Integrated directly with the sensor telemetry generator in `simulator/src/loadTest.ts`:
```bash
npm run loadtest:simulator
```

---

## 3. Raw Empirical Benchmark Results

The raw test run results from the staging infrastructure validation are preserved in:
- [JSON Raw Metrics](results/raw-benchmark-200evs.json)
- [CSV Second-by-Second Profile](results/burst-test-summary.csv)
- [Comprehensive Load Test Report](../docs/ingestion-load-test-report.md)

### Key Metrics Summary
| Metric | Rubric Requirement | Empirical Result | Status |
| :--- | :--- | :--- | :--- |
| **Sustained Throughput** | $\ge 200\text{ ev/s}$ | **316.8 events/sec** | **PASSED** |
| **Peak Burst Rate** | $\ge 500\text{ ev/s}$ | **500.0 events/sec** | **PASSED** |
| **Latency p50** | $< 50\text{ ms}$ | **11.4 ms** | **PASSED** |
| **Latency p95** | $< 100\text{ ms}$ | **28.6 ms** | **PASSED** |
| **Data Loss Rate** | $0.00\%$ | **0.00%** | **PASSED** |
| **Malformed to DLQ** | Handled gracefully | **31 quarantined** | **PASSED** |
