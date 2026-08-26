# Implementation Plan: Test Endpoint for Final Client Validation

**Ticket**: PAY-439 (child of PAY-432)

**Goal**: Give a newly-registered client a single endpoint to hit before going live on Prod that confirms (a) their account ID and role ARN are registered correctly, and (b) the fees registered to them are real fees. The failure mode itself is the diagnostic: where the call fails tells you which credential was mis-entered.

---

## Decision: new `/validate-client` endpoint, not a reuse of `/test`

`/test` is already taken. It is wired to the `testCert` Lambda, whose handler is
[`src/testCert.ts`](../src/testCert.ts) — a Pay.gov WSDL connectivity probe. It also serves
double duty as the scheduled health probe (`{ healthProbe: true }` events emit the
`emitPayGovHealthMetric` CloudWatch metric that monitoring alarms on).

Repointing the `/test` integration at a new Lambda would leave `testCert` reachable only by
the scheduled probe and silently kill the on-demand Pay.gov connectivity check. So: **new path,
new Lambda function, `/test` untouched.**

---

## How the endpoint behaves

```
GET /validate-client   (SigV4-signed, authorization = AWS_IAM)

  API Gateway
    -> resource policy: is the caller's ACCOUNT in allowed_account_ids?   no -> 403 (never reaches Lambda)
    -> AWS_IAM: is the SigV4 signature valid?                             no -> 403 (never reaches Lambda)
  Lambda (validateClientHandler -> lambdaHandler)
    -> extractCallerArn: sts assumed-role ARN -> iam role ARN             bad -> 403 "Invalid IAM principal format"
    -> getClientByRoleArn: ARN in client-permissions secret?              no  -> 403 "Client not registered"
                                                secret unparseable?           -> 500
  Use case (validateClient)
    -> allowedFeeKeys contains "*"                                            -> 403 "Forbidden - authorized Fees was misconfigured."
    -> every key resolves via getActiveFee()                              no  -> 403 / 500 (see error table)
    -> 200 { clientName, allowedFeeKeys }
```

The three-layer split is the whole point of the ticket: a 403 from API Gateway means the
account ID or signing setup is wrong; a 403 from Lambda means the role ARN is not in
`client-permissions`; a 403 from the use case means the fees registered to them are wrong.

---

## Build order: walking skeleton

Deploy a thin end-to-end slice first, prove the plumbing, then add the logic. The ordering is
deliberate:

- **Strict infra-first is not possible.** `aws_lambda_function` is driven by
  `var.artifact_s3_keys`, which comes from `build-lambda.sh` esbuilding the handler. No handler
  file means no bundle, no S3 key, nothing for Terraform to create.
- **The high-severity risks are all in the plumbing**, not the logic — the API Gateway
  `redeployment` trigger list and the `TF_VAR_*` wiring across three workflows. Hit those while
  the application code is too trivial to be the suspect.
- **The feedback loops are asymmetric.** Unit tests run in seconds; an infra iteration is a
  build, an upload, and a CI-gated apply. Settle the slow loop first so the logic work stays in
  the fast one.
- **This endpoint is additive and unreachable** until a client is handed the URL, so a thin
  version sitting in dev costs nothing. (The opposite ordering would apply to a change against
  `/init`.)

| Phase | What | Where it runs |
|---|---|---|
| 0 | Settle the path name | — |
| 1 | Minimum viable app code | local |
| 2 | Infra + CI, deploy to dev, verify | CI |
| 3 | Business logic + unit tests | local |
| 4 | Integration tests | CI / dev |
| 5 | Promote to stg, prod, DAWSON validation | CI |

---

## Phase 0 — Settle the path name

`/validate-client` is a proposal. `/client-check` or `/onboarding-check` read as less test-ish
to a client team. **Decide before Phase 2**: renaming after the route is deployed churns the
API Gateway deployment and means redoing the trigger list and the Lambda permission
`source_arn`. Cheap now, annoying later.

Every path reference below assumes `validate-client`.

---

## Phase 1 — Minimum viable app code

Three files. The use case is a passthrough at this stage — no fee validation, no wildcard
check. That is deliberate: `lambdaHandler` already supplies `extractCallerArn` →
`getClientByRoleArn` → `handleError`, so even this thin slice satisfies three ACs (the 200
response shape, the 403 for an unregistered ARN, and the 500 for a malformed secret).

### `src/schemas/ValidateClient.schema.ts`

GET with no body and no path params. The request schema exists to satisfy `lambdaHandler`'s
generic and its `parseAndValidate` contract. Follow the house convention — schema, then
`z.infer` directly below it, so the runtime validator and the compile-time type stay a single
source of truth.

```ts
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z); // required before .openapi() is available on the prototype

export const ValidateClientRequestSchema = z
  .object({})
  .openapi("ValidateClientRequest");

export type ValidateClientRequest = z.infer<typeof ValidateClientRequestSchema>;

export const ValidateClientResponseSchema = z
  .object({
    clientName: z.string().openapi({
      description: "Display name of the registered client, resolved from client-permissions.",
      example: "DAWSON",
    }),
    allowedFeeKeys: z.array(z.string()).openapi({
      description: "Every fee key registered to this client.",
      example: ["PETITION_FILING_FEE"],
    }),
  })
  .openapi("ValidateClientResponse");

export type ValidateClientResponse = z.infer<typeof ValidateClientResponseSchema>;
```

Note `ValidateClientRequest` infers to `{}`, which in TypeScript means "any non-nullish value"
rather than "empty object". Harmless — nothing reads it — but it is not a strict type.

### `src/useCases/validateClient.ts`

`AppContext` first, then `{ client, request }`, per the house rule. The body destructures only
`client`; `request` exists to satisfy `LambdaHandler<T>`.

```ts
export const validateClient = async (
  appContext: AppContext,
  { client }: { client: ClientPermission; request: ValidateClientRequest },
): Promise<ValidateClientResponse> => ({
  clientName: client.clientName,
  allowedFeeKeys: client.allowedFeeKeys,
});
```

Phase 3 replaces the body. The signature does not change.

### `src/handlers/validateClientHandler.ts`

Thin, matching [`getDetailsHandler.ts`](../src/handlers/getDetailsHandler.ts):

```ts
export const validateClientHandler = (
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> =>
  lambdaHandler({
    schema: ValidateClientRequestSchema,
    event,
    rawRequest: "{}",
    callback: validateClient,
  });
```

### Not calling `authorizeClient` — decided

`authorizeClient(client, feeKey)` is the wrong tool here and is deliberately omitted:

- There is no fee to pass it. The request is empty; the caller is not asking about a fee.
- Its wildcard semantics are inverted. It treats `"*"` as a **pass**
  (`allowedFeeKeys.includes("*") || allowedFeeKeys.includes(feeKey)`), while this endpoint must
  treat `"*"` as a **403**. Calling it would green-light the exact misconfiguration the ticket
  exists to catch.
- The question runs the other direction. It asks "is this one key in the allowed set"; this
  endpoint asks "is every member of the allowed set a real fee".

**Follow-up (developer):** [AGENTS.md](../AGENTS.md) words the requirement as an absolute MUST
tied to SigV4 protection. This route is SigV4-protected but only ever reads the caller's own
permission record — no fee parameter, no cross-client exposure, no transaction touched. Add a
carve-out sentence there alongside the existing read-only-dashboard exemption, so a later
auditor does not read this as a violation.

### Register in OpenAPI

Add the path to [`src/openapi/registry.ts`](../src/openapi/registry.ts) and regenerate with
`npm run generate:openapi` (updates `docs/openapi.yaml` and `docs/openapi.json`).

---

## Phase 2 — Infrastructure and CI

The expensive half. Adding a Lambda here touches the build script, the Lambda module, three
environments, and three workflows.

### Build

**`terraform/scripts/build-lambda.sh`**
- Add an esbuild block bundling `src/handlers/validateClientHandler.ts` to
  `dist/validateClient/validateClientHandler.js`, modeled on the `getDetails` block.
- Add `validateClient` to the zip loop (~line 231) and the final summary loop (~line 284).
- **Skip the CA-bundle loop (~line 245).** That loop is for Lambdas that connect to RDS. This
  one does not.

### Lambda module

**`terraform/modules/lambda/main.tf`** — add to `local.lambda_functions`:

```hcl
validateClient = {
  handler = "validateClientHandler.validateClientHandler"
}
```

No `timeout` override; the module default applies. No `ephemeral_storage`. Leave it out of
`local.payment_flow_lambdas` so it is not published or aliased.

### Per environment (dev, stg, prod — all three)

**`variables.tf`** — add `validateClient_s3_key` and `validateClient_source_code_hash`.

**`main.tf`** — add `validateClient` to both the `artifact_s3_keys` and `source_code_hashes`
maps in the `module "lambda"` block.

**`locals.tf`**
- Add `validateClient = 256` to `lambda_memory_sizes` (the ticket calls for 128–256MB).
- Add a **new env group**. Do not reuse `lambda_env_payment` — it carries the Pay.gov cert and
  RDS secrets this endpoint has no business holding:

```hcl
# Client-validation Lambda: reads the client-permissions secret only.
# No RDS, no Pay.gov credentials.
lambda_env_validate_client = {
  NODE_ENV                     = local.node_env
  APP_ENV                      = local.app_env
  CLIENT_PERMISSIONS_SECRET_ID = module.secrets.client_permissions_secret_id
}
```

- Add `validateClient = local.lambda_env_validate_client` to `lambda_env_by_function`.

### API Gateway module

**`terraform/modules/api-gateway/main.tf`** — five additions, mirroring the `/test` blocks:

1. `aws_api_gateway_resource.validate_client` with `path_part = "validate-client"`
2. `aws_api_gateway_method.validate_client_get`, `http_method = "GET"`,
   `authorization = "AWS_IAM"`
3. `aws_api_gateway_integration.validate_client_integration`, `AWS_PROXY`,
   `integration_http_method = "POST"`, uri pointing at
   `var.lambda_function_arns["validateClient"]`
4. `aws_lambda_permission.validate_client_permissions` with
   `source_arn = "${...execution_arn}/*/GET/validate-client"`
5. **Deployment triggers** — add the resource id, method id, integration id, *and* integration
   uri to the `redeployment` sha1 list in `aws_api_gateway_deployment.deployment`, plus the
   integration to its `depends_on`. Miss this and the stage will not pick up the new route.

No resource-policy change is needed: the existing statement already grants
`execute-api:Invoke` on `${execution_arn}/*` to the deploying account and every account in
`allowed_account_ids`. No CORS/OPTIONS method — this is a signed server-to-server call, never a
browser one.

### CI

**`.github/workflows/cicd-dev.yml`, `staging-deploy.yml`, `prod-deploy.yml`** — add
`TF_VAR_validateClient_s3_key` and `TF_VAR_validateClient_source_code_hash` to **every** env
block that already passes the `testCert` pair. `cicd-dev.yml` has several (PR plan, PR apply,
dev plan, dev apply) — grep for `TF_VAR_testCert_s3_key` and match the occurrence count.

### Verify before moving on

Deploy to dev, then confirm by hand:

- `signedFetch` with CI deployer creds -> 200, body is `{ clientName, allowedFeeKeys }`
- plain unsigned `fetch` -> 403 from API Gateway
- the deliberately-unregistered dev role (`terraform/environments/dev/main.tf:249`, exported in
  `outputs.tf`) -> 403 `Client not registered`
- `/test` still returns the Pay.gov probe body, and the scheduled health metric is still
  emitting

Do not start Phase 3 until these pass. The point of the ordering is that any failure after this
gate is application logic, not plumbing.

---

## Phase 3 — Business logic

Replace the `validateClient` body. Order matters:

1. **Wildcard check first.** `client.allowedFeeKeys.includes("*")` → throw
   `ForbiddenError("Forbidden - authorized Fees was misconfigured.")`. This runs before the
   per-key loop because `*` is not a fee key and would otherwise fall through as "not found",
   producing the wrong message.
2. **Resolve every key.** For each, call `getActiveFee(key)` from
   [`src/config/fees.ts`](../src/config/fees.ts). It throws `FeeNotFoundError` for an unknown
   key or one with no version activated yet, and `FeeConfigurationError` for a malformed entry.
   Catch `FeeNotFoundError` and rethrow as `ForbiddenError`; let `FeeConfigurationError`
   propagate (see the error table).
3. **Return** `{ clientName, allowedFeeKeys }`.

`getActiveFee` is called with no date argument, i.e. resolved as of now. Correct here — the
question is "is this config valid today", not pinning a historical transaction.

### Error handling, mapped to actual `handleError` behavior

[`handleError`](../src/handleError.ts) branches on `err.statusCode < 500`, then `ZodError`,
then `PayGovError`, then `ServerError`, then a catch-all generic 500. Critically:
**`FeeNotFoundError` and `FeeConfigurationError` carry no `statusCode`**, so an uncaught one
falls to the catch-all and returns exactly `"An unexpected error occurred while processing the
request"`. That is the ticket's "default server error message", so propagating
`FeeConfigurationError` untouched satisfies that AC.

| Status | Trigger | Where it comes from | Message the caller sees |
|---|---|---|---|
| 200 | All checks pass | use case | `{ clientName, allowedFeeKeys }` |
| 403 | Unsigned, bad signature, or account not in resource policy | API Gateway, pre-Lambda | API Gateway's own body |
| 403 | `userArn` missing / not an assumed-role ARN | `extractCallerArn` | `Missing IAM principal` / `Invalid IAM principal format` |
| 403 | Role ARN not in `client-permissions` | `getClientByRoleArn` | `Client not registered` |
| 403 | `allowedFeeKeys` contains `*` | use case | `Forbidden - authorized Fees was misconfigured.` |
| 403 | A key is unknown or has no activated version | use case, catching `FeeNotFoundError` | proposed: same misconfigured message |
| 500 | `client-permissions` secret unparseable | `getClientPermissions` → `ServerError` | `Failed to fetch client permissions` |
| 500 | A fee entry is malformed | `FeeConfigurationError`, uncaught | `An unexpected error occurred while processing the request` |

### Unit tests — `src/useCases/validateClient.test.ts`

- Valid client, two real fee keys → returns `{ clientName, allowedFeeKeys }`
- `allowedFeeKeys` contains `"*"` → `ForbiddenError`, exact misconfigured message
- `"*"` alongside valid keys → still rejected (wildcard checked first)
- Unknown fee key → `ForbiddenError`
- Key whose only version has a future `activationDate` → `ForbiddenError` (`getActiveFee`
  throws `FeeNotFoundError` when nothing has activated yet)
- Malformed fee config → `FeeConfigurationError` propagates uncaught
- Empty `allowedFeeKeys` → see Open Questions; test whichever behavior is chosen

Use real keys from `staticFees` rather than mocking `getActiveFee`, so the test breaks if the
fee config changes shape.

### Unit tests — `src/handlers/validateClientHandler.test.ts`

Follow [`handlerTestCommon.ts`](../src/handlers/handlerTestCommon.ts) — it sets
`LOCAL_DEV=false`, which matters, or `extractCallerArn` short-circuits to the mock ARN.

- Registered role, valid fees → 200, body parses against `ValidateClientResponseSchema`
- Missing `requestContext.identity.userArn` → 403
- `getClientByRoleArn` throws `ForbiddenError` → 403 `Client not registered`
- `getClientPermissions` throws `ServerError` → 500
- Use case throws `FeeConfigurationError` → 500 with the generic message

Coverage target is 90%+ (`npm run test:coverage`).

---

## Phase 4 — Integration tests

`src/test/integration/validateClient.test.ts`, using
[`sigv4Helper`](../src/test/integration/sigv4Helper.ts). Gate on `BASE_URL` plus credentials
the way `sigv4Smoke.test.ts` does, since this needs a deployed API Gateway.

- `signedFetch` with the CI deployer role → 200, correct `clientName`
- plain `fetch`, unsigned → 403 from API Gateway
- `signRequest` then tamper the Authorization header → 403 from API Gateway
- `assumeRole` on the unregistered dev role, then `signedFetchWithCredentials` → 403
  `Client not registered`

That last case is the one worth writing carefully: it is the only test that distinguishes
Gateway-layer rejection from Lambda-layer rejection, which is the entire diagnostic value of
this endpoint.

---

## Phase 5 — Rollout

1. Promote to stg. Re-run the Phase 2 verification list against the stg URL.
2. Promote to prod.
3. Hand the URL to the DAWSON team and have them call it with their prod role. Their
   credentials are already seeded in the Prod secret — the point of the exercise is to catch a
   mis-entry, so a 403 here is a successful test of the endpoint, not a failure of it. Route
   corrections to Benjamin Eccles.

---

## Open questions for the developer

1. **Path name** — see Phase 0. Blocks Phase 2.
2. **Unknown fee key → which status?** The AC specifies 403 for the `*` wildcard but is silent
   on a key that simply is not in `staticFees` (typo, stale secret). Plan assumes 403 with the
   same misconfigured message. Confirm, or specify a distinct message so the two are
   distinguishable in the response.
3. **Message mismatch on the unregistered-ARN case.** The AC says "the same `client not
   authorized` error used by our payment endpoints." The payment endpoints actually produce two
   different messages: `getClientByRoleArn` throws `Client not registered`, `authorizeClient`
   throws `Client not authorized for fee`. For an unregistered ARN the existing behavior is
   `Client not registered`, and reusing `lambdaHandler` gives that for free. Confirm that is
   acceptable rather than a literal `client not authorized`.
4. **Malformed-secret message.** The AC asks for "the default server error message", but
   `getClientPermissions` wraps parse failures in `ServerError("Failed to fetch client
   permissions")`, and `handleError` passes a `ServerError`'s own message through. So the caller
   sees that string, not the generic one. Both are 500. Accept the more specific message, or
   change it?
5. **Empty `allowedFeeKeys`.** A client registered with `[]` is arguably misconfigured — they
   can pay for nothing. 200 with an empty array, or 403? Plan currently assumes 200.

Questions 2–5 all land in Phase 3 and do not block Phases 0–2.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Forgetting the API Gateway deployment triggers | High — route deploys but the stage serves 403/404 until an unrelated apply | Explicit step in Phase 2; caught by the Phase 2 verification gate before any logic exists to confuse the diagnosis |
| Missing a `TF_VAR_*` block in a workflow | High — apply fails, or one environment silently lags | Grep every `TF_VAR_testCert_s3_key` occurrence and match the count; Phase 2 gate catches dev |
| Reusing `lambda_env_payment` out of convenience | Medium — hands Pay.gov cert and RDS secrets to an endpoint needing neither | New `lambda_env_validate_client` group, called out in Phase 2 |
| Renaming the path after deploy | Medium — churns the API Gateway deployment, trigger list, and permission ARN | Phase 0 gate |
| `lambdaHandler`'s module-level `getKnex()` prewarm | Low — this Lambda has no `RDS_SECRET_ARN`, so `getKnex()` builds a lazy localhost pool that never connects, and the prewarm's `.catch` swallows anything else | Check dev cold-start logs for Knex errors during the Phase 2 gate |
| Wildcard rejection surprises a dev caller | Low | `LOCAL_DEV=true` grants `allowedFeeKeys: ["*"]`, so a local caller is rejected by design. Documented; Phase 3 unit test pins it |

---

## Effort

Phase 1 is an afternoon. Phase 2 is the bulk of the work and the part most likely to need a
second apply. Phases 3 and 4 are well-understood once the plumbing is green — the remaining
unknowns are the Open Questions, not the implementation.
