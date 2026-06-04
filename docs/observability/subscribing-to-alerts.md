# Subscribing to alerts

How to add yourself (or someone else) to the Payment Portal alert distribution list. **No code deployment required** — by design, so the on-call rotation can change in minutes.

There are two paths. Pick by intent:

- **Ad-hoc / immediate** (CLI direct subscribe) — adds a subscription to the SNS topic right now, no terraform involved. Use for temporary coverage, on-call backups, or quick personal subscriptions.
- **Canonical / declarative** (Secrets Manager + targeted apply) — adds your entry to the source-of-truth subscriber list. Use for permanent team additions, audit trail, and config that survives a stack rebuild.

Both satisfy the AC "subscribable without a deployment" (no PR, no merge, no CI release). The difference is whether the subscription is tracked by terraform's canonical list.

## Who should subscribe

- Anyone on payments-team rotation
- Anyone temporarily covering on-call
- Anyone owning an active production issue who wants to see when service recovers

When you leave the rotation, **remove yourself** — stale subscribers means the actual on-call person doesn't realize they're not the one being paged.

---

## Path A — CLI direct subscribe (instant, no terraform)

This is the literal "subscribable without a deployment" path. The subscription is created immediately in AWS, with no infrastructure change required.

### 1. Subscribe via CLI

For email:

```bash
# Replace {env} with stg or prod and your address
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:747103385969:ustc-payment-portal-{env}-alerts \
  --protocol email \
  --notification-endpoint you@ustaxcourt.gov
```

For SMS (E.164 format, leading `+` and country code required):

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:747103385969:ustc-payment-portal-{env}-alerts \
  --protocol sms \
  --notification-endpoint +15555551234
```

### 2. Confirm the subscription

- **Email:** click the confirmation link AWS sends to your inbox.
- **SMS:** reply `YES` to the AWS confirmation text.

Until confirmed, the subscription is in `PendingConfirmation` and won't deliver alerts.

### Caveat

These subscriptions exist in AWS but **not in the canonical subscriber list** stored in Secrets Manager. They survive across terraform applies (terraform only manages subscriptions it created), but they're invisible to anyone auditing "who's subscribed?" by reading the secret.

For temporary or personal additions, this is fine. For permanent on-call rotation membership, use Path B so future engineers can find the entry by reading the secret.

---

## Path B — Secrets Manager + targeted apply (canonical, declarative)

Use this for permanent team additions. The subscriber appears in the auditable list, survives stack rebuilds, and gets removed cleanly when you remove their entry from the secret.

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

### 2. Build the new list and write it back

Append your entry:

```bash
aws secretsmanager update-secret \
  --secret-id "ustc/pay-gov/{env}/monitoring-subscribers" \
  --secret-string '[{"protocol":"email","endpoint":"someone@ustaxcourt.gov"},{"protocol":"email","endpoint":"you@ustaxcourt.gov"}]'
```

### 3. Targeted terraform apply

The secret holds the desired state, but the `aws_sns_topic_subscription` resources only exist after terraform creates them. Run a targeted apply (not a full deploy):

```bash
cd terraform/environments/{env}
terraform apply -target='module.monitoring.aws_sns_topic_subscription.subs'
```

This applies only the subscriptions resource, not the rest of the stack. No code release; no CI deploy.

### 4. Confirm the subscription

Same as Path A — click the email link or reply `YES` to the SMS.

---

## Remove yourself

**If subscribed via Path A (CLI):** unsubscribe via the link in any alert email (AWS adds an unsubscribe footer), or:

```bash
# Find your subscription ARN
aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:747103385969:ustc-payment-portal-{env}-alerts

# Unsubscribe by ARN
aws sns unsubscribe --subscription-arn <subscription-arn>
```

**If subscribed via Path B (secret):** fetch the current list, drop your entry, write it back, re-apply targeted. The terraform state will tear down your subscription.

Don't mix the two — if you're in the secret, unsubscribing via the email link only mutes you temporarily; the next terraform apply will recreate the subscription. The secret is the source of truth for Path B entries.

---

## SMS-specific notes

- **Cost:** ~$0.0075/message in `us-east-1`. At 50 alerts/month, ~$0.40.
- **Sandbox status:** check first:

  ```bash
  aws sns get-sms-sandbox-account-status
  ```

  If sandboxed, AWS Support has to provision a toll-free origination number and exit the sandbox before SMS sends work. Multi-day process.
- **Format:** E.164 only (`+1` prefix for US, no dashes/spaces/parens).

---

## Verification — make sure alerts actually reach you

Trigger a synthetic alarm against the env you subscribed to:

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "ustc-payment-portal-stg-processPayment-5xx-critical" \
  --state-value ALARM \
  --state-reason "Subscription test by {your-name}"
```

You should receive an email/SMS within ~1 minute. Flip back:

```bash
aws cloudwatch set-alarm-state \
  --alarm-name "ustc-payment-portal-stg-processPayment-5xx-critical" \
  --state-value OK \
  --state-reason "Subscription test complete"
```

You should receive a recovery email/SMS within ~1 minute.

If neither arrives, the subscription is either unconfirmed (re-click the confirmation link) or there's an account-level issue (open a ticket).
