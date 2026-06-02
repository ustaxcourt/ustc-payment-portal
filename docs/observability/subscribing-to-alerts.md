# Subscribing to alerts

How to add yourself (or someone else) to the Payment Portal alert distribution list. **No PR or deployment required** — this is by design so that the on-call rotation can change in minutes, not hours.

## Who should subscribe

- Anyone on payments-team rotation
- Anyone temporarily covering on-call
- Anyone owning an active production issue who wants to see when service recovers

When you leave the rotation, **remove yourself** — stale subscribers means the actual on-call person doesn't realize they're not the one being paged.

## How it works (one paragraph)

Each env has an SNS topic named `ustc-payment-portal-{env}-alerts`. The subscribers list is stored in AWS Secrets Manager (`ustc/pay-gov/{env}/monitoring-subscribers`) as a JSON array. Terraform reads the secret and creates one `aws_sns_topic_subscription` per entry. Updating the secret + re-running `terraform apply` adds or removes subscriptions. The secret has `lifecycle.ignore_changes` on its content, so updates outside terraform are not overwritten.

For SMS, AWS sends a confirmation to the phone number. For email, AWS sends a confirmation link to the inbox. **Subscriptions don't deliver alerts until you confirm.**

## Add yourself — AWS CLI

### 1. Find the current subscribers

```bash
# Replace {env} with stg or prod
aws secretsmanager get-secret-value \
  --secret-id "ustc/pay-gov/{env}/monitoring-subscribers" \
  --query SecretString --output text | jq .
```

You'll see something like:

```json
[
  {"protocol":"email","endpoint":"someone@ustaxcourt.gov"}
]
```

### 2. Build the new list

Append your entry. For email:

```json
[
  {"protocol":"email","endpoint":"someone@ustaxcourt.gov"},
  {"protocol":"email","endpoint":"you@ustaxcourt.gov"}
]
```

For SMS (E.164 format, leading `+` and country code required):

```json
[
  {"protocol":"email","endpoint":"someone@ustaxcourt.gov"},
  {"protocol":"sms","endpoint":"+15555551234"}
]
```

### 3. Write the new list back

```bash
aws secretsmanager update-secret \
  --secret-id "ustc/pay-gov/{env}/monitoring-subscribers" \
  --secret-string '[{"protocol":"email","endpoint":"someone@ustaxcourt.gov"},{"protocol":"email","endpoint":"you@ustaxcourt.gov"}]'
```

### 4. Re-apply terraform to materialize the subscription

The secret holds the desired state, but the `aws_sns_topic_subscription` resources only exist after `terraform apply`. In CI this happens on the next deploy automatically. If you want it sooner, run apply manually from `terraform/environments/{env}/`:

```bash
cd terraform/environments/{env}
terraform apply -target=module.monitoring
```

### 5. Confirm the subscription

- **Email:** click the confirmation link AWS sends to your inbox.
- **SMS:** reply `YES` to the AWS confirmation text.

Until confirmed, the subscription is in `PendingConfirmation` state and won't deliver alerts.

## Add yourself — AWS Console

1. AWS Console → Secrets Manager → `ustc/pay-gov/{env}/monitoring-subscribers`
2. **Retrieve secret value** → **Edit** → modify the JSON, **Save**
3. Wait for next CI deploy, or trigger one manually
4. Confirm via the email/SMS that AWS sends

## Remove yourself

Same flow — fetch the current list, drop your entry, write it back, re-apply.

You can also unsubscribe directly via the link in any alert email (AWS adds an unsubscribe footer automatically). But the secret will still contain your entry, so the next `terraform apply` will re-create the subscription and you'll get another confirmation email. The secret is the source of truth.

## SMS-specific notes

- **Cost:** SMS costs roughly $0.0075 per message in `us-east-1`. At 50 alerts/month, ~$0.40. Not a blocker.
- **Sandbox status:** if the AWS account is in SMS sandbox mode, only pre-verified phone numbers can receive SMS. Check status:

```bash
aws sns get-sms-sandbox-account-status
```

If sandboxed, contact AWS Support to request production access. This is a multi-day process.

- **Format:** E.164 only (`+1` prefix for US, country code required, no dashes/spaces/parens).

## Verification — make sure alerts actually reach you

Trigger a synthetic alarm against the env you subscribed to:

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "ustc-payment-portal-stg-processPayment-5xx-critical" \
  --state-value ALARM \
  --state-reason "Subscription test by {your-name}"
```

You should receive an email/SMS within ~1 minute. After verifying, flip back:

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "ustc-payment-portal-stg-processPayment-5xx-critical" \
  --state-value OK \
  --state-reason "Subscription test complete"
```

You should receive a recovery email/SMS within ~1 minute.

If neither arrives, the subscription is either unconfirmed (re-click the confirmation link), or there's an account-level issue (open a ticket).
