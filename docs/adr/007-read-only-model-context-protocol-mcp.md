# ADR 007: Read-Only Model Context Protocol (MCP) Server Architecture

## Status
Accepted

## Context
Feature F-22 requires an open, extensible Model Context Protocol (MCP) interface that enables conversational AI assistants (e.g. Amazon Bedrock Nova, Claude, or external evaluator agents) to inspect real-time school environmental data and official safety policies without granting write access or risking cross-school data manipulation.

## Decision
1. Implement a lightweight, read-only MCP server (`services/mcp/`) adhering to the Model Context Protocol JSON-RPC specification.
2. Expose strictly read-only tools:
   - `get_school_decision(school_id)`: Fetches current safety status, primary reason, heat index, and AQI.
   - `get_sensor_readings(school_id, location_type)`: Retrieves microclimate telemetry from campus sensors (field, courtyard, classrooms).
   - `get_outdoor_policy(version, query_type)`: Retrieves grounded sections of *Model School Outdoor Activity Policy v1.2*.
3. Enforce cryptographic token scoping: External clients must supply a scoped HMAC-SHA256 bearer token (`iss: 'airsafe-chat'`, `aud: 'airsafe-mcp'`, `exp <= 300s`) bearing the authorized `school_id`. Requests attempting to query unassigned school IDs or with mismatched issuer/audience are rejected with HTTP 401 / 403.
4. Prohibit all mutation tools (e.g., no override creation, no user deletion) over the public MCP interface.

## Consequences
- AI agents ground answers exclusively on verified ground truth.
- Zero risk of unintended state mutations or prompt-injection-driven policy tampering.
