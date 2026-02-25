# PAY-008: AWS Sig4 Implementation Checklist

> **⚠️ NOTE: Remove this document before merging into main. Do not remove until final documentation for this feature is added.**

This checklist tracks the implementation of AWS IAM authentication using SigV4 request signing as defined in [ADR-0004](../architecture/decisions/0004-iam-authentication-for-api-gateway.md).

## Overview

Replace Bearer token authentication with AWS IAM authentication (SigV4) to:

- Give each client app (DAWSON, Nonattorney Admissions Exam App, etc.) its own identity
- Enable fine-grained authorization per `tcsAppId`
- Remove shared API access tokens
- Improve auditability via CloudTrail

---

## Phase 1: Infrastructure (Terraform)

### 1.1 API Gateway IAM Authorization

- [x] Update `terraform/modules/api-gateway/main.tf`:
  - [x] Change `aws_api_gateway_method.init_post` authorization from `"NONE"` to `"AWS_IAM"`
  - [x] Change `aws_api_gateway_method.process_post` authorization from `"NONE"` to `"AWS_IAM"`
  - [x] Change `aws_api_gateway_method.details_get` authorization from `"NONE"` to `"AWS_IAM"`
  - [x] Change `aws_api_gateway_method.test_get` authorization from `"NONE"` to `"AWS_IAM"` — `/test` is protected under SigV4 to mimic the actual request flow and because this is an open source project, leaving it open would allow anyone to trigger live outbound requests to Pay.gov
- [x] Add API Gateway resource policy for cross-account access
  - [x] Create variable for allowed client AWS account IDs (`allowed_account_ids` in `terraform/modules/api-gateway/variables.tf`, default `[]`)
  - [x] Configure policy to allow `execute-api:Invoke` from client accounts — deploying account always included; client accounts added via `var.allowed_account_ids` at deploy time

### 1.2 Add Client Permissions Secret

Because this is an open source project, authorized client ARNs cannot be hardcoded in the repository. Client permissions are stored in AWS Secrets Manager and loaded at runtime.

- [x] Add `aws_secretsmanager_secret.client_permissions` to `terraform/modules/secrets/main.tf`
  - [x] Secret name: `ustc/pay-gov/{env}/client-permissions`
  - [x] Secret value is a JSON array (populated manually after deploy — never in repo):
    ```json
    [
      {
        "clientName": "DAWSON",
        "clientRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME",
        "allowedFeeIds": ["PETITIONS_FILING_FEE", "ADMISSIONS_FEE"]
      }
    ]
    ```
- [x] Update `locals.tf` to include the new secret ARN in `secret_arns` — added to `secret_arns_always` in `terraform/modules/secrets/locals.tf`
- [x] Grant Lambda read access to the secret — handled automatically via `secret_arns_always` feeding into `aws_iam_role_policy.lambda_secrets_read`
- [x] Add `CLIENT_PERMISSIONS_SECRET_ID` to Lambda environment variables — added to `lambda_env_base` in dev, stg, and prod `locals.tf`
- [ ] Manually populate secret values via AWS CLI/Console (never in repo) — **deployment-time action, not a code change**

### 1.3 Remove Legacy API Access Token

- [x] Remove `aws_secretsmanager_secret.api_access_token` from `terraform/modules/secrets/main.tf`
- [x] Update `locals.tf` to remove api_access_token from `secret_arns`
- [x] Remove `API_ACCESS_TOKEN_SECRET_ID` from Lambda environment variables
- [x] Update any IAM policies that reference the secret ARN — handled automatically via `local.secret_arns`

### 1.4 Fix API Gateway Deployment Triggers

- [x] Update `terraform/modules/api-gateway/main.tf` deployment `triggers` block to include method resources:
  - Current triggers only include integrations, not methods
  - Authorization changes won't trigger redeployment without this fix
  - Add method IDs to the `redeployment` hash alongside integration IDs

---

## Phase 2: Application Code Changes

### 2.1 Update Authorization Logic

- [x] Refactor `src/authorizeRequest.ts`:
  - [x] Remove Bearer token validation logic
  - [x] Remove `cachedToken` and Secrets Manager fetch
  - [x] Extract IAM principal from `event.requestContext.identity.userArn`
  - [x] Return IAM principal ARN for use in authorization
  - [x] Add local dev bypass: when `LOCAL_DEV=true`, return a dummy ARN (`arn:aws:iam::000000000000:role/local-dev-role`) so auth is skipped without breaking the rest of the auth pipeline

### 2.2 Create Client Permissions Client

Because this is an open source project, authorized client ARNs cannot live in the codebase. Instead, they are stored in AWS Secrets Manager as a JSON array and loaded at Lambda cold start.

- [x] Define `ClientPermission` type in `src/clients/clientPermissionsClient.ts`: `{ clientName, clientRoleArn, allowedFeeIds }`
- [x] Create `src/clients/clientPermissionsClient.ts`:
  - [x] Fetch JSON from Secrets Manager using `CLIENT_PERMISSIONS_SECRET_ID` env var
  - [x] Cache the parsed result in memory with 5-minute TTL
  - [x] Implement ARN conversion before lookup — `userArn` arrives as `arn:aws:sts::ACCOUNT_ID:assumed-role/role-name/session-name` but Secrets Manager stores `arn:aws:iam::ACCOUNT_ID:role/role-name`; implemented as `convertAssumedRoleToIamArn` in `authorizeRequest.ts`
  - [x] Implement `getClientByRoleArn(roleArn: string)` that searches the cached list using the converted ARN
  - [x] Return `null` for unknown clients (triggers 403)
- [x] Add a local dev entry to the cached list when `LOCAL_DEV=true`:
  - [x] `clientRoleArn: "arn:aws:iam::000000000000:role/local-dev-role"` matching the dummy ARN returned by `authorizeRequest`
  - [x] `allowedFeeIds: ["*"]` wildcard — allows any feeId in local dev
- [x] Add unit tests for `clientPermissionsClient`

### 2.3 Implement feeId Authorization

> **Note:** Renamed from `authorizeAppId`/`tcsAppId` to `authorizeFeeId`/`feeId` for clarity.

- [x] Create `src/authorizeFeeId.ts`:
  - [x] Lookup client via `getClientByRoleArn` from `clientPermissionsClient`
  - [x] Validate requested `feeId` is in `allowedFeeIds`
  - [x] Return 403 with message "Client not registered" if client not found
  - [x] Return 403 with message "Client not authorized for feeId" if feeId not allowed
- [x] Add unit tests for feeId authorization

### 2.4 Update Lambda Handlers

- [x] Update `src/lambdaHandler.ts`:
  - [x] Pass `event.requestContext` to authorization functions
  - [x] Extract `feeId` from request body/params
  - [x] Call feeId authorization after IAM auth
- [x] Note: API Gateway handles IAM auth failures (returns 403 "Missing Authentication Token" or "Invalid signature")
- [x] Ensure 403 returned for application-level authorization failures with descriptive messages

### 2.5 Update Types

- [x] `ClientPermission` type defined in `src/clients/clientPermissionsClient.ts`
- [x] `AuthContext` type created in `src/types/AuthContext.ts`
- [x] `AppContext.ts` — no changes needed

### 2.6 Error Handling

- [x] Create `src/errors/forbidden.ts` returning 403 status with custom message
- [x] Update `src/handleError.ts` — no changes needed, already handles any error with `statusCode < 500` generically
- [x] Deprecate `src/errors/unauthorized.ts` — `@deprecated` added; full deletion pending (blocked until `unauthorized.ts` import confirmed removed from all files)

---

## Phase 3: Testing

### 3.1 Unit Tests

- [x] Update `src/authorizeRequest.test.ts`:
  - [x] Remove Bearer token test cases
  - [x] Add IAM principal extraction tests
  - [x] Test local dev bypass returns dummy ARN when `LOCAL_DEV=true`
- [x] Create `src/clients/clientPermissionsClient.test.ts` (mock Secrets Manager):
  - [x] Test `getClientByRoleArn` returns client when ARN matches
  - [x] Test `getClientByRoleArn` returns `null` for unknown ARN
  - [x] Test Secrets Manager fetch is cached (only called once across multiple lookups)
- [x] Create `src/authorizeFeeId.test.ts`:
  - [x] Test valid feeId authorization
  - [x] Test invalid feeId returns 403 with "Client not authorized for feeId" message
  - [x] Test unknown client returns 403 with "Client not registered" message
- [x] Update `src/lambdaHandler.test.ts` for new auth flow

### 3.2 Integration Tests

- [x] Update `src/test/integration/` tests:
  - [x] Remove Bearer token from test requests
  - [ ] Add SigV4 signing to test requests — **blocked by Phase 1** (no point signing requests against an endpoint not enforcing SigV4 yet)
  - [ ] Test cross-account authentication scenarios — **blocked by Phase 1 + DAWSON coordination**

### 3.3 SigV4 Smoke Test

- [ ] Create a smoke test that runs against deployed environments to detect auth config breakage — **blocked by Phase 1**
  - [ ] Sign request with valid AWS credentials (test IAM role)
  - [ ] Call a protected endpoint (e.g., `/details` or `/test`)
  - [ ] Assert: valid signature → 200 (or business-level error, not 403)
  - [ ] Assert: missing/invalid signature → 403
- [ ] Consider running in CI/CD after each deployment
- [ ] Alert if smoke test fails (indicates broken IAM auth config)

---

## Phase 4: Documentation & Cleanup

### 4.1 Documentation Updates

> **Why this matters:** The old docs described Bearer token auth throughout. Anyone reading them now would get the wrong picture of how the API works. Keeping docs in sync with the code prevents confusion when onboarding new developers or clients.

- [x] Update `README.md` with new authentication requirements
  - Removed `API_ACCESS_TOKEN` from the env vars table
  - Added `CLIENT_PERMISSIONS_SECRET_ID` and `LOCAL_DEV` to the env vars table
  - Updated the Testing section to remove the stale reference to `apiToken`
- [x] Update `running-locally.md` for local development auth
  - Replaced `API_ACCESS_TOKEN_SECRET_ID=""` with `LOCAL_DEV=true` in the example `.env.dev` block
  - Added explanation of what `LOCAL_DEV=true` does and why it must not be set in deployed environments
- [x] Update `src/openapi/registry.ts`:
  - [x] 403 descriptions already read `"Forbidden - invalid SigV4 signature or client not authorized"` — no changes needed
  - [x] `sigv4` security scheme already registered correctly — no changes needed
- [x] Regenerate `docs/openapi.yaml` and `docs/openapi.json` — not needed, `registry.ts` had no changes
- [x] `PUBLISHING.md` — no auth-related content, no changes needed

### 4.2 Environment Variables

> **Why this matters:** `.env.example` is the template developers copy when setting up a new environment. Both files need to reflect the current set of variables — stale entries mislead developers into thinking removed variables still do something.

- [x] Update `.env.example`:
  - [x] Removed `API_ACCESS_TOKEN_SECRET_ID` — nothing in the codebase reads this anymore
  - [x] Added `CLIENT_PERMISSIONS_SECRET_ID="ustc/pay-gov/dev/client-permissions"`
- [x] Update `.env.dev`:
  - [x] Removed `API_ACCESS_TOKEN_SECRET_ID`
  - [x] Added `LOCAL_DEV=true` — no `CLIENT_PERMISSIONS_SECRET_ID` needed locally because `LOCAL_DEV=true` bypasses the Secrets Manager fetch entirely

### 4.3 Client Onboarding Guide

> **Why this matters:** Without this, every new client integration requires tribal knowledge. The guide gives client teams everything they need to set up SigV4 signing and gives the Payment Portal team a repeatable runbook so onboarding is consistent every time.

- [x] Document IAM role requirements for client accounts — see `docs/client-onboarding.md`
  - IAM role must be at root path — STS drops custom path prefixes from assumed-role ARNs
  - Role needs `execute-api:Invoke` permission on the API Gateway resource
- [x] Provide example SigV4 signing code for clients
  - Working TypeScript example using `@aws-sdk/signature-v4` and `defaultProvider`
- [x] Create runbook for adding new client applications — see `docs/client-onboarding.md`:
  1. Collect IAM role ARN, AWS account ID, and requested fee IDs from the client
  2. Add entry to `ustc/pay-gov/{env}/client-permissions` secret in AWS Secrets Manager — no code change or deployment needed, takes effect after cache TTL expires
  3. Add client AWS account ID to API Gateway resource policy via Terraform — requires deployment
  4. Verify with a test request from the client

---

## Phase 5: Migration & Deployment

### 5.1 Pre-Deployment

- [ ] Coordinate with DAWSON team on migration timeline
- [ ] Ensure DAWSON has SigV4 signing implementation ready
- [ ] Seed initial client permissions in AWS Secrets Manager (`ustc/pay-gov/{env}/client-permissions`):
  - [ ] DAWSON client role ARN and allowed tcsAppIds
  - [ ] Other client apps as needed
  - [ ] Note: these values never appear in the repository

### 5.2 Deployment Order

1. [ ] Add API Gateway resource policy for cross-account access
2. [ ] Coordinate: Deploy Payment Portal code changes
3. [ ] Coordinate: Deploy client code changes (SigV4 signing)
4. [ ] Switch API Gateway authorization to AWS_IAM
5. [ ] Redeploy API Gateway stage (required for auth changes to take effect)
6. [ ] Verify authentication works in lower environments
7. [ ] Remove legacy API access token secret (after validation period)

### 5.3 Rollback Plan

- [ ] Document rollback procedure:
  - [ ] Revert API Gateway authorization to NONE
  - [ ] Restore Bearer token validation code
  - [ ] Re-create API access token secret if needed

---

## Acceptance Criteria Verification

- [x] **API Keys removed**: No Bearer token or API_ACCESS_TOKEN used in application code — Terraform cleanup still pending (Phase 1)
- [ ] **SigV4 authentication**: All API requests authenticated via AWS IAM SigV4 signing — **blocked by Phase 1**
- [x] **App identities**: Each client app has unique IAM role — implemented in code; real ARNs seeded in Phase 5
- [ ] **403 for auth failures**: Unauthenticated/invalid SigV4 requests return 403 — **blocked by Phase 1** (API Gateway not enforcing SigV4 yet)
- [x] **403 for authorization failures**: Authenticated but unauthorized requests return 403 with descriptive message:
  - "Client not registered" — IAM principal not in client permissions
  - "Client not authorized for feeId" — client exists but feeId not allowed

---

## Notes

- This implementation follows [ADR-0004](../architecture/decisions/0004-iam-authentication-for-api-gateway.md)
- Cross-account coordination is required with client teams
- Client permissions (IAM role ARNs) are stored in AWS Secrets Manager rather than in code — this project is open source and authorized client ARNs must not appear in the repository
- Client permissions can be updated without deployment; revocation is instant after cache expires
- Adding a new client requires updating the Secrets Manager secret (no code deploy) plus a Terraform deploy to update the API Gateway resource policy
- Lambda caches the permissions list in memory; new clients are live on the next cold start
- CloudTrail will automatically log all IAM-authenticated requests
- Client IAM roles must be created at the root path (e.g., `arn:aws:iam::ACCOUNT_ID:role/role-name`) because STS assumed-role ARNs drop the path prefix, which would cause ARN reconstruction to fail and break authorization

---

## Edge Cases & Considerations

**consider these loose until we do a ensemble review**

### IAM Principal Format

- `event.requestContext.identity.userArn` comes as assumed-role format: `arn:aws:sts::ACCOUNT_ID:assumed-role/role-name/session-name`
- Store IAM role ARN in Secrets Manager: `arn:aws:iam::ACCOUNT_ID:role/role-name`
- [x] Implement ARN conversion in code (`convertAssumedRoleToIamArn` in `src/authorizeRequest.ts`):
  1. Parse assumed-role ARN to extract account ID and role name
  2. Reconstruct IAM role ARN format for lookup
  3. Match against stored `clientRoleArn` in Secrets Manager

> **⚠️ Important:** Client IAM roles must be created at the root path (e.g., `arn:aws:iam::ACCOUNT_ID:role/role-name`), not with a custom path (e.g., `arn:aws:iam::ACCOUNT_ID:role/custom-path/role-name`). STS assumed-role ARNs drop the path prefix, which would cause ARN reconstruction to fail and break authorization. Document this requirement in the client onboarding guide.

### Environment-Specific Configs

- [x] Each environment (dev/stg/prod) has its own Secrets Manager secret for client permissions — `ustc/pay-gov/dev/client-permissions`, `stg/...`, `prod/...`
- [ ] Client role ARNs differ per environment (different AWS accounts) — **populated manually at deploy time, never in repo**

### Secrets Manager Caching

- [x] Cache client permissions in Lambda memory to avoid per-request Secrets Manager calls
- [x] Cache TTL set to 5 minutes (configurable via `CLIENT_PERMISSIONS_CACHE_TTL_MS` env var)
- [x] In-memory cache implemented in `clientPermissionsClient.ts`

### Local Development

- [x] Bypass SigV4 auth when `LOCAL_DEV=true`
- [x] Return mock IAM role ARN (`arn:aws:iam::000000000000:role/local-dev-role`) for local requests
- [x] Documented in `running-locally.md`

### API Gateway Deployment

- [ ] After Terraform changes, API Gateway stage must be redeployed for auth changes to take effect — **deployment-time action**
- [x] Add method resources to deployment triggers in `terraform/modules/api-gateway/main.tf` — all four method IDs now included in `redeployment` hash alongside integration IDs

### CI/CD Pipeline

- [ ] Smoke test (section 3.3) covers SigV4 validation after deployments — **blocked by Phase 1**
- No other GitHub Actions currently call the hosted Payment Portal API
