# PAY-304: Collapse per-PR-workspace deployer inline policies

## Problem

`terraform apply` on PR workspaces in dev started failing:

```
Error: putting IAM Role (ustc-payment-processor-dev-cicd-deployer-role) Policy
(pr-workspace-ustc-payment-processor-pr-208): operation error IAM: PutRolePolicy,
https response error StatusCode: 409, LimitExceeded: Maximum policy size of
10240 bytes exceeded for role ustc-payment-processor-dev-cicd-deployer-role
```

AWS caps the **sum of inline policy sizes on a single IAM role at 10,240 bytes** (hard limit, not adjustable via support).

## Root Cause

The dev CI/CD deployer role (`ustc-payment-processor-dev-cicd-deployer-role`) is shared across every PR workspace. Each PR workspace was attaching its own inline policy named `pr-workspace-ustc-payment-processor-pr-<num>` with three statements scoped to that PR's exact ARNs:

- `AssumeTestUnauthorizedRole` — `sts:AssumeRole` on the PR's `*-test-unauthorized-role`
- `InvokeMigrationRunner` — `lambda:InvokeFunction` on the PR's `*-migrationRunner`
- `InvokeApiGateway` — `execute-api:Invoke` on the PR's API Gateway

At ~500–600 bytes per policy, the role's 10,240-byte budget capped concurrent PRs at ~17. Orphan policies left behind by failed PR cleanup runs ate further into the budget.

## Fix

Replace the per-PR inline policies with a **single shared inline policy** on the dev deployer role, using wildcarded ARNs that match every current and future PR workspace.

### Implementation

In [terraform/environments/dev/main.tf:308-346](terraform/environments/dev/main.tf#L308-L346):

- Renamed resource `aws_iam_role_policy.deployer_pr_workspace` → `deployer_pr_workspaces`
- Renamed inline policy `pr-workspace-${local.name_prefix}` → `pr-workspaces`
- Gated with `count = local.environment == "dev" ? 1 : 0` so only the default (dev) workspace creates it; PR workspaces no longer touch the deployer role at all
- Replaced exact ARN references with wildcards:
  | Statement | Old resource | New resource |
  | --- | --- | --- |
  | `AssumeTestUnauthorizedRoles` | `aws_iam_role.test_unauthorized.arn` | `arn:aws:iam::<acct>:role/ustc-payment-processor-pr-*-test-unauthorized-role` |
  | `InvokeMigrationRunners` | `${local.name_prefix}-migrationRunner` ARN | `arn:aws:lambda:<region>:<acct>:function:ustc-payment-processor-pr-*-migrationRunner` |
  | `InvokeApiGateways` | `${module.api.api_gateway_execution_arn}/*` | `arn:aws:execute-api:<region>:<acct>:*/*/*/*` |

Wildcarding to `pr-*` is safe because the PR namespace is only ever assigned by [.github/workflows/cicd-dev.yml:117](.github/workflows/cicd-dev.yml#L117) (`TF_VAR_namespace: pr-${{ github.event.pull_request.number }}`).

## Rollout Steps

1. **Apply in default (dev) workspace** to create the new shared `pr-workspaces` policy on the deployer role.
2. **Manually clean up orphan inline policies** on the deployer role — these aren't in any workspace's state, so Terraform won't remove them:
   ```bash
   aws iam list-role-policies --role-name ustc-payment-processor-dev-cicd-deployer-role
   # For each pr-workspace-ustc-payment-processor-pr-* still attached:
   aws iam delete-role-policy \
     --role-name ustc-payment-processor-dev-cicd-deployer-role \
     --policy-name pr-workspace-ustc-payment-processor-pr-<num>
   ```
3. **Verify** the role has only `pr-workspaces` (plus any non-PR baseline policies) and total inline size is well under 10,240 bytes.
4. **Re-run a PR pipeline** end-to-end to confirm `terraform apply`, migrationRunner invocation, and API Gateway invocation all succeed without the new wildcarded policy needing to be touched per-PR.

## Acceptance Criteria

- [ ] `pr-workspace-ustc-payment-processor-pr-*` per-PR inline policies replaced by a single shared `pr-workspaces` policy on the dev deployer role
- [ ] Shared policy is gated to the dev workspace only (`count = local.environment == "dev" ? 1 : 0`); PR workspaces don't write to the deployer role
- [ ] Existing orphan `pr-workspace-*` policies deleted from `ustc-payment-processor-dev-cicd-deployer-role`
- [ ] A fresh PR workspace can `terraform apply`, invoke its migrationRunner, and call its API Gateway end-to-end without `LimitExceeded`

## Files Modified

| File | Change |
| --- | --- |
| `terraform/environments/dev/main.tf` | Collapsed per-PR `deployer_pr_workspace` into single shared `deployer_pr_workspaces` policy with wildcarded ARNs, gated to dev workspace |

## Notes

- AWS's 10,240-byte cap on the sum of inline role policies is a hard limit — can't be raised via support. If this budget is hit again, next step is moving statements to a customer-managed policy (separate quota: 6,144 bytes per managed policy, but a role can attach up to 10).
- Long-term consideration: move the deployer role itself to the foundation layer so it isn't managed by the same workspace it deploys (avoids the chicken-and-egg apply ordering called out in [PAY-049](PAY-049-database-provisioning.md)).
