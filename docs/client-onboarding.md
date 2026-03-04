# Client Onboarding Guide

This guide covers what a client application needs to do to integrate with the USTC Payment Portal using AWS SigV4 authentication.

---

## Overview

The Payment Portal uses AWS IAM authentication (SigV4). Every API request must be cryptographically signed using the caller's AWS credentials. API Gateway verifies the signature before the request reaches any Lambda function — unsigned or incorrectly signed requests are rejected with a 403 before they touch our code.

This means client applications do not send passwords, API keys, or Bearer tokens. They sign requests using their IAM role credentials.

---

## IAM Role Requirements

### The client must have an IAM role

Each client application needs a dedicated IAM role in their AWS account. The Payment Portal team will need the ARN of this role (e.g., `arn:aws:iam::123456789012:role/dawson-client`) to register the client.

### The role must be at the root path

**Important:** The IAM role must be created at the root path — not a custom path.

- Correct: `arn:aws:iam::123456789012:role/my-role`
- Wrong: `arn:aws:iam::123456789012:role/custom-path/my-role`

When AWS services (like Lambda) receive a request, the caller identity arrives as an STS assumed-role ARN (`arn:aws:sts::ACCOUNT_ID:assumed-role/role-name/session`). The Payment Portal converts this back to the IAM role ARN for lookup. STS assumed-role ARNs drop any custom path prefix during this conversion — a role at a custom path cannot be matched against its stored ARN, and authorization will always fail.

> **Debugging tip:** If your role uses a custom path prefix and authorization fails, the API will return a `403` with `"Client not registered"`. This is because the reconstructed ARN (without the path prefix) won't match the ARN stored in the client-permissions secret. Double-check the role ARN you provided at onboarding matches the format `arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME` with no path segment.

### The role must have permission to call the Payment Portal

The role needs `execute-api:Invoke` permission on the Payment Portal API Gateway resource. The Payment Portal team will add the client's AWS account to the API Gateway resource policy as part of onboarding.

---

## Signing Requests with SigV4

Every HTTP request to the Payment Portal must be signed. Here is a reference implementation using the AWS SDK for JavaScript (AWS SDK v3):

```typescript
import { SignatureV4 } from "@aws-sdk/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@aws-sdk/protocol-http";

const signer = new SignatureV4({
  credentials: defaultProvider(), // uses IAM role credentials automatically
  region: "us-east-1",
  service: "execute-api",
  sha256: Sha256,
});

async function signedFetch(
  url: string,
  method: string,
  body?: string,
): Promise<Response> {
  const parsedUrl = new URL(url);

  const request = new HttpRequest({
    method,
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname,
    headers: {
      "Content-Type": "application/json",
      host: parsedUrl.hostname,
    },
    body,
  });

  const signedRequest = await signer.sign(request);

  return fetch(url, {
    method,
    headers: signedRequest.headers,
    body,
  });
}

// Example: initialize a payment
const response = await signedFetch(
  "https://payments.ustaxcourt.gov/init",
  "POST",
  JSON.stringify({
    feeId: "PETITION_FILING_FEE",
    trackingId: "your-tracking-id",
    amount: 60.0,
    urlSuccess: "https://your-app.com/payment/success",
    urlCancel: "https://your-app.com/payment/cancel",
  }),
);
```

The `defaultProvider()` from `@aws-sdk/credential-provider-node` automatically picks up credentials from the environment — IAM role credentials when running in AWS (Lambda, ECS, EC2), or local credentials from `~/.aws/credentials` for development.

---

## What to Send the Payment Portal Team

To be onboarded, provide the following:

1. **Your IAM role ARN** — the role your application will use to sign requests (e.g., `arn:aws:iam::123456789012:role/your-role-name`). Confirm the role is at the root path.
2. **Your AWS account ID** — needed to add your account to the API Gateway resource policy.
3. **The fee IDs you need access to** — the Payment Portal authorizes per fee type. You will only be granted access to the specific fee IDs your application needs.

---

## Permitting Apps to Charge Specific Fees

The Payment Portal authorizes each client application on a per-fee basis. Authorization is enforced in the Lambda handler — every request is checked against the client's registered permissions before any payment is initiated.

### How it works

Client permissions are stored in the `ustc/pay-gov/{env}/client-permissions` secret in AWS Secrets Manager. The secret value is a JSON **array** of client entries; each entry lists the fee IDs that client is permitted to charge and has this shape:

```json
{
  "clientName": "DAWSON",
  "clientRoleArn": "arn:aws:iam::111111111111:role/dawson-client",
  "allowedFeeIds": ["PETITION_FILING_FEE"]
}
```

- **Adding a `feeId` to `allowedFeeIds`** — permits that app to charge the fee. Requests with that `feeId` will proceed.
- **Omitting a `feeId` from `allowedFeeIds`** — blocks that app from charging the fee. Requests with an unauthorized `feeId` return `403 Forbidden` with `"Client not authorized for feeId"`.
- **A client not present in the secret at all** — returns `403 Forbidden` with `"Client not registered"`.

### Currently supported fee IDs

| Fee ID                          | Description                                             |
| ------------------------------- | ------------------------------------------------------- |
| `PETITION_FILING_FEE`           | Petition filing fee (fixed: $60)                        |
| `NONATTORNEY_EXAM_REGISTRATION` | Non-attorney admissions exam registration (fixed: $250) |

For the full fee catalog including Pay.gov integration details, see [supported_court_fees_and_client_auth.md](architecture/API-Documentation/supported_court_fees_and_client_auth.md).

### Updating permissions

To grant or revoke a fee permission, update the Secrets Manager secret (see Step 2 of the runbook below). No code change or deployment is required — the Lambda picks up the updated secret after the 5-minute cache TTL expires. Revocation takes effect within the same window.

---

## Runbook: Adding a New Client

This is for the Payment Portal team when onboarding a new client.

### Step 1 — Get client information

Collect from the client:

- IAM role ARN
- AWS account ID
- Requested fee IDs

Verify the role ARN is at the root path — no custom path segment between `role/` and the role name. If the ARN contains more than one segment after `role/` (e.g. `role/service/my-role`), ask the client to create a root-path role before proceeding.

### Step 2 — Update the client permissions secret

Add the new client entry to the `ustc/pay-gov/{env}/client-permissions` secret in AWS Secrets Manager. This does not require a code change or deployment.

```json
[
  {
    "clientName": "DAWSON",
    "clientRoleArn": "arn:aws:iam::111111111111:role/dawson-client",
    "allowedFeeIds": ["PETITION_FILING_FEE"]
  },
  {
    "clientName": "New Client Name",
    "clientRoleArn": "arn:aws:iam::222222222222:role/new-client-role",
    "allowedFeeIds": ["FEE_ID_ONE"]
  }
]
```

The Lambda will pick up the updated secret on the next cold start (or after the 5-minute cache TTL expires). Revocation is immediate after the cache expires — just remove the entry.

### Step 3 — Update the allowed account IDs secret

Add the client's AWS account ID to the `ustc/pay-gov/{env}/allowed-account-ids` secret in AWS Secrets Manager:

```bash
# Get current value
aws secretsmanager get-secret-value \
  --secret-id ustc/pay-gov/dev/allowed-account-ids \
  --query SecretString --output text

# Update with new account (example adding account 222222222222)
aws secretsmanager put-secret-value \
  --secret-id ustc/pay-gov/dev/allowed-account-ids \
  --secret-string '["111111111111", "222222222222"]'
```

**Important:** After updating the secret, you must run `terraform apply` in the target environment. The API Gateway resource policy is generated at Terraform plan time from the secret value — changes to the secret are not automatically reflected until the next deployment.

This is separate from the client permissions secret — the allowed-account-ids secret controls which AWS accounts can reach the API Gateway endpoint at all, while client-permissions controls which role ARNs are authorized for which fee IDs.

### Step 4 — Verify

Once both steps are done, have the client make a test request and confirm a 200 response (or a business-level error, not a 403).
