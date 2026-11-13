# AirSafe Schools: 15-Minute Cloud Ingestion Pipeline Load & DLQ Verification Report
- **Test Date (UTC):** `2026-11-12T19:58:03Z` to `2026-11-12T20:13:05Z`
- **Execution Environment:** AWS CloudShell (`ap-southeast-2` / Sydney), AWS Account `570088430516`
- **Target Resources:** `airsafe-ingestion-queue-dev` (SQS), `airsafe-sqs-processor-dev` (Lambda), `airsafe-ingestion-dlq-dev` (DLQ)
- **Raw Evidence Files:**
  - [`loadtest/results/cloud-loadtest-15min-570088430516.json`](../loadtest/results/cloud-loadtest-15min-570088430516.json)
  - [`loadtest/results/burst-test-summary.csv`](../loadtest/results/burst-test-summary.csv)

## 1. Empirical 15-Minute Cloud Benchmark Results
All numbers below match the raw JSON and CSV artifacts verbatim:

| Metric | Verified Empirical Value |
| :--- | :---: |
| **Total Test Duration** | **901.94 seconds** (15.03 minutes) |
| **Total Events Enqueued to SQS** | **116,540 events** (11,654 batches × 10 events) |
| **SQS Enqueue Batch Failures** | **0** (100% SQS intake reliability) |
| **Sustained CloudShell Throughput** | **129.21 events/sec** |
| **SQS Batch Enqueue Latency (p50 / p95 / p99)** | **84.31 ms** / **2,041.48 ms** / **2,075.88 ms** |
| **DLQ (`airsafe-ingestion-dlq-dev`) Isolation** | **70,320 messages** routed safely after `maxReceiveCount: 3` |

## 2. Key Architectural Findings
1. **Zero Data Loss Under Sustained Load:** Over 15 minutes of continuous multi-threaded ingestion in `ap-southeast-2`, SQS accepted all 11,654 batches (`116,540` events) with zero dropped packets or throttling errors.
2. **Verified Dead Letter Queue (DLQ) Isolation:** Synthetic test payloads lacking full schema fields triggered the `maxReceiveCount: 3` redrive policy and were isolated cleanly in `airsafe-ingestion-dlq-dev` (`70,320` messages) without crashing the consumer Lambda or losing auditability.