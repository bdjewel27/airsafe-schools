# ADR 009: DynamoDB On-Demand Capacity & Automated 30-Day TTL

## Status
Accepted

## Context
AirSafe Schools collects continuous environmental telemetry (PM2.5, PM10, temperature, relative humidity, calculated AQI, and Heat Index) across 100+ schools. Traffic is highly diurnal—peaking heavily during active school hours (07:00 to 17:00 BST) and dropping to near zero during nighttime hours and weekends.
Provisioned Read/Write Capacity Units (RCUs/WCUs) would either incur idle costs during school closures or risk throttling during simultaneous morning sensor bursts. Furthermore, historical sensor logs can accumulate indefinitely, leading to unconstrained storage costs that threaten the $100 budget cap.

## Decision
1. **On-Demand Billing Mode:**
   - Configure Amazon DynamoDB using `BillingMode.PAY_PER_REQUEST`.
   - Provisioned throughput is set to zero; charges occur purely per read and write request unit.
2. **Automated Data Expiration (TTL):**
   - Enable DynamoDB Time-to-Live (TTL) on the `ttl` attribute (Unix epoch in seconds).
   - Set retention to exactly **30 days** (`now + 30 * 86400`) on all raw sensor event items.
   - Latest school decision records use a dedicated primary key (`school_id`, `decision`) and remain persistent without premature expiration.
3. **Single-Table Design:**
   - Partition Key: `school_id` (guaranteeing strict multi-tenant boundary per partition).
   - Sort Key: `timestamp` or entity identifier (e.g., `DECISION#LATEST`, `NOTE#<timestamp>`, `OVERRIDE#<timestamp>`).

## Consequences
- **Zero Idle Storage Waste:** Stale sensor records older than 30 days are automatically purged in the background by DynamoDB at zero RCU/WCU cost.
- **Budget Compliance:** Storage costs stabilize under $0.50/month even with continuous 100-school ingestion.
- **Instant Elasticity:** Accommodates high-volume ingestion surges without provisioning headaches or pre-warming delays.
