# AirSafe Schools: MCP Server & Shared Tool Library

This directory provides the central Model Context Protocol (MCP) server implementation and shared tool schema definitions for the AirSafe Schools intelligent advisory platform (F-22).

---

## 1. Architectural Role

The MCP Server grounds Amazon Bedrock Nova / Claude models strictly in real-time school environmental telemetry and the Model School Outdoor Activity Policy v1.2 without LLM hallucination.

```
Bedrock Agent / Claude ──[JSON-RPC 2.0]──> AirSafe MCP Server ──> DynamoDB Readings Table
                                               │
                                               └──> Policy v1.2 Engine
```

### Shared Tools Available:
1. `get_school_decision`: Retrieves real-time environmental decision (`SAFE`, `CAUTION`, `MODIFY`, `MOVE_INDOORS`), policy reasons, and metrics for the authenticated school.
2. `get_sensor_readings`: Fetches real-time PM2.5, AQI, temperature, humidity, and heat index for school locations (`FIELD`, `COURTYARD`, `CLASSROOM`).
3. `get_outdoor_policy`: Retrieves threshold tables and official citations from Model School Outdoor Activity Policy v1.2.

---

## 2. Security Hard Gates (Strictly Enforced)

- **Hard Gate 1 (Fail-Closed Secrets):** Server immediately throws a fatal exception if `MCP_JWT_SECRET` is missing.
- **Hard Gate 2 (Cryptographic Tenant Isolation):**
  - Tool schemas **never** expose `school_id` or `scoped_token` as LLM parameters to prevent cross-tenant extraction or prompt injection.
  - Scoping is strictly extracted from HMAC-SHA256 authenticated HTTP Authorization Bearer tokens.
  - Missing, invalid, or expired (>5 minutes) tokens fail closed immediately with HTTP 401/403.
  - Cross-tenant queries are blocked: arguments containing a different `school_id` are ignored in favor of the cryptographic token claim.

---

## 3. Running & Testing

```bash
# Build TypeScript
npm run build

# Run automated 16-point security & protocol verification suite
npm test
```
