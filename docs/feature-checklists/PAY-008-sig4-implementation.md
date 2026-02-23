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

- [ ] Update `terraform/modules/api-gateway/main.tf`:
  - [ ] Change `aws_api_gateway_method.init_post` authorization from `"NONE"` to `"AWS_IAM"`
  - [ ] Change `aws_api_gateway_method.process_post` authorization from `"NONE"` to `"AWS_IAM"`
  - [ ] Change `aws_api_gateway_method.details_get` authorization from `"NONE"` to `"AWS_IAM"`
  - [ ] Change `aws_api_gateway_method.test_get` authorization from `"NONE"` to `"AWS_IAM"`
- [ ] Add API Gateway resource policy for cross-account access
  - [ ] Create variable for allowed client AWS account IDs
  - [ ] Configure policy to allow `execute-api:Invoke` from client accounts

### 1.2 Remove Legacy API Access Token

- [ ] Remove `aws_secretsmanager_secret.api_access_token` from `terraform/modules/secrets/main.tf`
- [ ] Update `locals.tf` to remove api_access_token from `secret_arns`
- [ ] Remove `API_ACCESS_TOKEN_SECRET_ID` from Lambda environment variables
- [ ] Update any IAM policies that reference the secret ARN

---

## Phase 2: Application Code Changes

### 2.1 Update Authorization Logic

- [ ] Refactor `src/authorizeRequest.ts`:
  - [ ] Remove Bearer token validation logic
  - [ ] Remove `cachedToken` and Secrets Manager fetch
  - [ ] Extract IAM principal from `event.requestContext.identity.userArn`
  - [ ] Return IAM principal ARN for use in authorization

### 2.2 Create Client Permissions Config

- [ ] Create `src/config/clientPermissions.ts`:
  - [ ] Define `ClientPermission` type: `{ clientName, clientRoleArn, allowedTcsAppIds }`
  - [ ] Export `CLIENT_PERMISSIONS` array with registered clients
  - [ ] Implement `getClientByRoleArn(roleArn: string)` lookup function
  - [ ] Return `null` for unknown clients (triggers 403)
- [ ] Add unit tests for client permissions config

### 2.3 Implement tcsAppId Authorization

- [ ] Create `src/authorizeAppId.ts`:
  - [ ] Lookup client in `CLIENT_PERMISSIONS` by IAM principal
  - [ ] Validate requested `tcsAppId` is in `allowedTcsAppIds`
  - [ ] Return 403 with message "Client not registered" if client not found
  - [ ] Return 403 with message "Client not authorized for tcsAppId" if tcsAppId not allowed
- [ ] Add unit tests for tcsAppId authorization

### 2.4 Update Lambda Handlers

- [ ] Update `src/lambdaHandler.ts`:
  - [ ] Pass `event.requestContext` to authorization functions
  - [ ] Extract `tcsAppId` from request body/params
  - [ ] Call tcsAppId authorization after IAM auth
- [ ] Note: API Gateway handles IAM auth failures (returns 403 "Missing Authentication Token" or "Invalid signature")
- [ ] Ensure 403 returned for application-level authorization failures with descriptive messages

### 2.5 Update Types

- [ ] Add/update types in `src/types/`:
  - [ ] `ClientPermission` type for config entries
  - [ ] `AuthContext` type containing IAM principal info
- [ ] Update `AppContext.ts` if needed

### 2.6 Error Handling

- [ ] Create `src/errors/forbidden.ts` returning 403 status with custom message
- [ ] Update `src/handleError.ts` to handle ForbiddenError
- [ ] Remove or deprecate `src/errors/unauthorized.ts` (no longer needed - API Gateway handles 403 for IAM failures)

---

## Phase 3: Testing

### 3.1 Unit Tests

- [ ] Update `src/authorizeRequest.test.ts`:
  - [ ] Remove Bearer token test cases
  - [ ] Add IAM principal extraction tests
- [ ] Create `src/config/clientPermissions.test.ts`
- [ ] Create `src/authorizeAppId.test.ts`:
  - [ ] Test valid tcsAppId authorization
  - [ ] Test invalid tcsAppId returns 403 with "Client not authorized for tcsAppId" message
  - [ ] Test unknown client returns 403 with "Client not registered" message
- [ ] Update `src/lambdaHandler.test.ts` for new auth flow

### 3.2 Integration Tests

- [ ] Update `src/test/integration/` tests:
  - [ ] Remove Bearer token from test requests
  - [ ] Add SigV4 signing to test requests
  - [ ] Test cross-account authentication scenarios

### 3.3 SigV4 Smoke Test

- [ ] Create a smoke test that runs against deployed environments to detect auth config breakage:
  - [ ] Sign request with valid AWS credentials (test IAM role)
  - [ ] Call a protected endpoint (e.g., `/details` or `/test`)
  - [ ] Assert: valid signature → 200 (or business-level error, not 403)
  - [ ] Assert: missing/invalid signature → 403
- [ ] Consider running in CI/CD after each deployment
- [ ] Alert if smoke test fails (indicates broken IAM auth config)

---

## Phase 4: Documentation & Cleanup

### 4.1 Documentation Updates

- [ ] Update `README.md` with new authentication requirements
- [ ] Update `running-locally.md` for local development auth
- [ ] Update `src/openapi/registry.ts`:
  - [ ] Update 403 descriptions from "invalid or missing API key" to "invalid SigV4 signature or client not authorized"
  - [ ] Verify `sigv4` security scheme is correct (already present)
- [ ] Regenerate `docs/openapi.yaml` and `docs/openapi.json` via `npm run generate:openapi`
- [ ] Update `PUBLISHING.md` if relevant

### 4.2 Environment Variables

- [ ] Update `.env.example`:
  - [ ] Remove `API_ACCESS_TOKEN_SECRET_ID`
- [ ] Update `.env.dev` for local development

### 4.3 Client Onboarding Guide

- [ ] Document IAM role requirements for client accounts
- [ ] Provide example SigV4 signing code for clients
- [ ] Create runbook for adding new client applications:
  1. Client contacts Payment Portal team with their IAM role ARN and requested tcsAppIds
  2. Team adds client to `src/config/clientPermissions.ts`
  3. Team adds client AWS account ID to API Gateway resource policy (Terraform)
  4. Deploy changes to enable access

---

## Phase 5: Migration & Deployment

### 5.1 Pre-Deployment

- [ ] Coordinate with DAWSON team on migration timeline
- [ ] Ensure DAWSON has SigV4 signing implementation ready
- [ ] Add initial clients to `src/config/clientPermissions.ts`:
  - [ ] DAWSON client role ARN and allowed tcsAppIds
  - [ ] Other client apps as needed

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

- [ ] **API Keys removed**: No Bearer token or API_ACCESS_TOKEN used for authentication
- [ ] **SigV4 authentication**: All API requests authenticated via AWS IAM SigV4 signing
- [ ] **App identities**: Each client app has unique IAM role (DAWSON, Nonattorney Admissions Exam App, etc.)
- [ ] **403 for auth failures**: Unauthenticated/invalid SigV4 requests return 403 (handled by API Gateway)
- [ ] **403 for authorization failures**: Authenticated but unauthorized requests return 403 with descriptive message:
  - "Client not registered" - IAM principal not in config
  - "Client not authorized for tcsAppId" - client exists but tcsAppId not allowed

---

## Notes

- This implementation follows [ADR-0004](../architecture/decisions/0004-iam-authentication-for-api-gateway.md)
- Cross-account coordination is required with client teams
- Client permissions are managed via config (requires deployment to add/update clients)
- CloudTrail will automatically log all IAM-authenticated requests

---

## Edge Cases & Considerations

**consider these loose until we do a ensemble review**

### IAM Principal Format

- `event.requestContext.identity.userArn` may be in assumed-role format: `arn:aws:sts::123456789012:assumed-role/role-name/session-name`
- Client lookup should extract the role ARN or handle both formats

### Environment-Specific Configs

- [ ] Client role ARNs differ per environment (dev/stg/prod)
- [ ] Consider: separate config files per env, or environment variable for role ARN prefix

### Local Development

- [ ] Bypass SigV4 auth when running locally (e.g., check `NODE_ENV === 'development'` or `LOCAL_DEV` env var)
- [ ] Return mock IAM context for local requests to allow testing use cases
- [ ] Document in `running-locally.md` that auth is bypassed locally

### API Gateway Deployment

- [ ] After Terraform changes, API Gateway stage must be redeployed for auth changes to take effect
- [ ] Verify deployment triggers in Terraform config

### CI/CD Pipeline

- [ ] Update any automated tests that use Bearer token authentication
- [ ] Update GitHub Actions / deployment scripts if they call the API
