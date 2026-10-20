# AirSafe Schools: Weekly Status Report — Week 1

**Period:** Week 1 (Foundation, Baseline Checks & Data Modeling)  
**Status Date:** Friday, Week 1  
**Budget Burn to Date:** $0.85 (Remaining: $99.15)  

---

## 1. Objectives Completed
- Executed Day 1 Capability Checks (`docs/day1-checks.md`):
  - Verified Bedrock model availability in Sydney (`ap-southeast-2`); documented Nova quota 0.0 (`ThrottlingException`) and authored ADR-001 for deterministic policy fallback.
  - Setup AWS Budgets ($50, $80 alert, $95 freeze action recommendation).
  - Validated Open-Meteo weather and OpenAQ v3 API response payloads for Bangladesh districts.
- Scaffolding of CDK Infrastructure:
  - Bootstrapped DynamoDB single-table schema (`AirSafe-Readings-dev`, `AirSafe-Decisions-dev`).
  - EventBridge scheduled poller for 64 districts.
- Implemented core Rothfusz Heat Index regression and Golden Test Suite (`G-01` to `G-12`) per Appendix B (100% pass).

## 2. Blockers & Risks Identified
- Bedrock Sydney on-demand token quota is 0.0. Resolved via ADR-001 deterministic policy engine architecture.

## 3. Next Week Priorities
- Ingestion pipeline (SQS + DLQ), REST API Gateway, and JWT authentication.
