# ADR 005: Multi-Tenant Data Isolation & Role-Based Access Control (RBAC)

## Status
Accepted

## Context
AirSafe Schools serves thousands of distinct educational institutions across Bangladesh. Under Hard Gate 2 and Hard Gate 3, cross-tenant data leaks and unauthorized role escalation (e.g., a teacher granting themselves coordinator powers or modifying another school's data) constitute critical evaluation failures.

## Decision
1. **Tenant Isolation at Rest:** Partition all DynamoDB tables using `school_id` as the primary Hash Key (`school_id = :sid`), ensuring queries cannot cross school tenant boundaries.
2. **Identity & Authentication:** Use Amazon Cognito User Pools with **Self Sign-Up completely disabled** (`allowAdminCreateUserOnly: true`). Accounts are provisioned solely via administrator invitation.
3. **Short-Lived Scoped Tokens:** Embed custom claims (`custom:school_id`, `custom:role`) directly into Cognito JWT tokens with 5-minute maximum validity.
4. **Client-Side & Server-Side RBAC Enforcement:**
   - Teacher Role: Read-only access to decision cards and trend analytics; ability to attach context notes to current activities.
   - Coordinator Role: Authorized to trigger temporary session overrides (requiring mandatory written justification) and manage staff invitations strictly for their own institution.
   - Any client request attempting to supply an alternate `school_id` parameter is rejected; the backend Lambda authorizer strictly enforces the authenticated token's `school_id` claim.

## Consequences
- Guaranteed cryptographic tenant boundaries.
- Full compliance with STRIDE threat model specifications.
