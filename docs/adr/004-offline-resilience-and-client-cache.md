# ADR 004: Offline Resilience, Graceful Degradation & Network Listener

## Status
Accepted

## Context
Schools in semi-urban or rural Bangladesh frequently suffer from intermittent 3G/4G connectivity, campus power cuts, or indoor signal dead-zones. A teacher standing in the schoolyard must never encounter an unhandled crash dialog, infinite spinner, or blank white screen when checking environmental safety.

## Decision
1. Implement a persistent local cache in the Android client that preserves the latest confirmed sensor snapshot and decision payload.
2. Integrate Android's native `ConnectivityManager.NetworkCallback` to listen directly for connectivity loss (`onLost`) and restoration (`onAvailable`), eliminating manual toggles.
3. Automatically render a high-contrast amber Warning Banner upon network disconnection: *"অফলাইন মোড — ক্যাশ করা ডেটা দেখানো হচ্ছে"* (*"Offline Mode: Showing cached snapshot"*).
4. Enforce Policy Rule 4 (Stale Data Guardrail): If offline cached data is older than 90 minutes, the app automatically caps the decision at `PROCEED_WITH_PRECAUTIONS`, preventing outdated "Safe" decisions.
5. Invalidate or gray out actions that require server connectivity (e.g., live invitations) while keeping read-only safety metrics immediately available.

## Consequences
- 100% crash-free operation during total network severance (verified under Journey J-2 in `docs/device-test.md`).
- Sub-second cold start time (790 ms) achieved by immediately hydrating cached state prior to initiating network handshakes.
