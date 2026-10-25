# ADR 013: Native Amazon Cognito User Pool Authorization, RBAC via Groups, and Elimination of Password Exposure

## Status
Accepted

## Context
During initial development sprints, AirSafe Schools implemented a hybrid authentication model:
1. Amazon Cognito User Pool (`AirSafe-Users-dev`) was provisioned in `infra/lib/auth-stack.ts` with user groups (`teacher`, `coordinator`, `platform-admin`) and custom attributes (`school_id`, `role`), but the API Gateway authorizer (`CognitoUserPoolsAuthorizer`) was attached only to a verification endpoint (`/cognito-check`).
2. Primary client authentication utilized a DynamoDB-backed invite table with PBKDF2-SHA256 password hashes and internal HMAC-SHA256 signed JWT tokens.
3. Coordinator staff invitation (`POST /schools/{schoolId}/staff/invite`) generated a random initial password and returned `temporary_password` directly in the HTTP JSON response body for out-of-band delivery.
4. The API Lambda did not receive `USER_POOL_ID` in its environment configuration, meaning the automated Cognito `AdminCreateUser` workflow and automated email delivery of temporary passwords did not execute in production.

This hybrid approach introduced several architectural and security risks (Section 16, Gates 1–3, S-2):
- Return of temporary passwords in network responses posed risks of logging and credential leakage.
- Discrepancy between documentation claiming "Cognito attributes client read-only" and live API paths relying on internal tokens.
- Role management relied partially on custom attributes rather than exclusive server-governed group membership.

## Decision
We enforce a fully integrated, cloud-native Amazon Cognito authentication and authorization architecture:

1. **Protect All School Routes with `CognitoUserPoolsAuthorizer`:**
   In `infra/lib/api-stack.ts`, all tenant-scoped routes under `/schools/{schoolId}/*` are configured with `CognitoUserPoolsAuthorizer` (`authorizationType: apigateway.AuthorizationType.COGNITO`). API Gateway cryptographically verifies incoming Cognito tokens against the User Pool JWKS before forwarding requests to the handler Lambda.

2. **Eliminate Credential Exposure in Invite Response:**
   In `services/api/src/index.ts`, `temporary_password` is completely removed from the `POST /schools/{schoolId}/staff/invite` response payload.

3. **Cloud-Native User Provisioning with `AdminCreateUser`:**
   `USER_POOL_ID` is passed as an immutable environment variable to the API Lambda in `infra/lib/api-stack.ts`, and the Lambda's IAM execution role is granted least-privilege permissions (`cognito-idp:AdminCreateUser`, `cognito-idp:AdminAddUserToGroup`, `cognito-idp:AdminGetUser`, `cognito-idp:AdminInitiateAuth`).
   When a coordinator invites a teacher, the backend issues `AdminCreateUserCommand` with `DesiredDeliveryMediums: ['EMAIL']`, delegating credential generation and welcome notification delivery securely to AWS Cognito.

4. **Exclusive Role Governance via `cognito:groups`:**
   `role` is removed from `customAttributes` in `infra/lib/auth-stack.ts` and from `UserAttributes` during creation. Roles (`TEACHER`, `COORDINATOR`, `PLATFORM_ADMIN`) are assigned exclusively through Cognito group membership (`AdminAddUserToGroupCommand`) and parsed by `authenticateRequest()` strictly from verified `cognito:groups` claims.

5. **In-Lambda Fail-Closed Verification:**
   The API Lambda's `authenticateRequest()` maintains fail-closed checks on `requestContext.authorizer.claims`, verifying tenant matching against `custom:school_id` and role authorization from `cognito:groups`.

## Consequences
- **Security:** Zero plaintext passwords or temporary passwords appear in HTTP responses, logs, or client-side storage.
- **Compliance:** Full compliance with Hard Gates 1, 2, and 3; Policy S-2 (invite-only access); and Section 16 architectural standards.
- **Integrity:** Live API Gateway configuration matches the architectural claims recorded in `STATUS.md` and `RUNBOOK.md`.
