# Incident Response Runbook
USTC Payment Portal

This runbook provides on‑call engineers and maintainers with a structured process for identifying, mitigating, and resolving incidents involving the **USTC Payment Portal**. It is intended for operational use during disruptions affecting payment initiation, redirects, completion workflows, API responses, or downstream interactions with Pay.gov (or the USTC Pay Test Server in non‑prod).

---

## 🔔 1. When to Declare an Incident

An incident should be declared when **any** of the following occur:

- Repeated failures in transaction initiation or completion
- Redirect URL generation failures
- Unusual spikes in `4xx` or `5xx` responses
- SOAP downstream timeouts or `DOWNSTREAM_ERROR` patterns
- Degraded or failing `GET /v1/health` checks in staging or production
- Evidence of incorrect or incomplete Pay.gov responses
- Repeated idempotency conflicts (`409 CONFLICT`) outside normal patterns
- Any security, data integrity, or access‑control concern
- CI/CD deployment failures affecting users
- Significant increase in issue reports from upstream USTC applications

If unsure, **declare the incident** — it’s easier to stand down than catch up late.

---

## 🚨 2. Initial Triage Checklist

**Assigned responder:**
Capture who is primary and secondary during the incident.

**Immediate steps (within first 5 minutes):**

1. **Acknowledge alerts** (monitoring system or reports from upstream applications).
2. **Check logs** for error clusters:
   - `correlationId` patterns
   - Downstream SOAP failures
   - Auth errors
   - Token lifecycle anomalies
3. **Check the health endpoint**:
   ```bash
   curl -sS $BASE_URL/v1/health
````

4.  Compare behavior across environments:
    *   Dev
    *   Staging
    *   Production
5.  Identify severity level:
    *   **SEV‑1:** Payments cannot be initiated or completed
    *   **SEV‑2:** Intermittent failures, partial degradation
    *   **SEV‑3:** Minor issue, no user impact yet

**If impacting production payments → declare SEV‑1 immediately.**

***

## 📊 3. Diagnostics

### A. Check Logs (Application Layer)

Look for:

*   `VALIDATION_ERROR` spikes
*   `DOWNSTREAM_ERROR` faults with Pay.gov
*   Token mismatch or replay indications
*   `UNAUTHORIZED` or `FORBIDDEN` errors (token failures)
*   Slow response times or queue/connection buildup

Use `correlationId` for transaction-level tracing.

### B. SOAP Downstream Checks (Pay.gov or Test Server)

1.  Validate connectivity:
    ```bash
    curl -v https://<paygov-service-endpoint>  # non-PAN-safe endpoint only
    ```
2.  Check SOAP envelope validity (enabled if debug logs permitted).
3.  Confirm WSDL/XSD availability (Pay.gov dev vs test server).

### C. Infrastructure

*   API Gateway / Lambda / EC2 health
*   Cold start spikes
*   Scaling policies
*   Terraform drift
*   Recent infra deployments

### D. Release History

*   Check last few commits or releases:
    *   Have changes been deployed recently?
    *   Was there a config change (success/cancel URLs, tokens, environment values)?

### E. Dependency / Integration Checks

*   Confirm USTC upstream apps are sending valid payloads:
    *   Schema alignment
    *   Valid URLs
    *   Matching `referenceId` across calls

***

## 🩹 4. Mitigation Actions

Depending on root cause:

### A. Downstream failures (Pay.gov unavailable, slow, or erroring)

*   Enable retry logic (if disabled for emergency reasons).
*   Temporarily reduce upstream traffic.
*   Communicate expected delays to stakeholders.
*   Fail gracefully with user‑friendly messaging.

### B. Token/redirect failures

*   Validate config for token issuance.
*   Confirm environment variables for:
    *   AUTH tokens
    *   Pay.gov endpoint URLs
    *   Redirect URL signing (if applicable).

### C. Service degradation (latency, 5xx)

*   Scale compute resources (if autoscaling insufficient).
*   Roll back to previously known good artifact.
*   Restart affected instances/services.

### D. Configuration issues (common)

*   Incorrect environment variables
*   Invalid success/cancel URLs
*   Expired bearer/auth tokens
*   Terraform drift → re‑apply with correct state

### E. Recent deployment regression

*   Roll back immediately to last stable version.
*   Restore from the previous artifact set.

***

## 🗣 5. Communication

During a SEV‑1 or SEV‑2:

*   Provide **initial incident announcement** within 10 minutes.
*   Send updates every **15–30 minutes** depending on severity.
*   Communicate:
    *   Summary of impact
    *   Current mitigation steps
    *   Expected next update time
    *   Whether upstream applications should back off or retry

Once stable, send a **resolution notification**.

***

## 🧪 6. Verification (Post‑Mitigation)

After mitigation, verify:

1.  Initiate → redirect → complete flow works end‑to‑end.
2.  SOAP downstream calls succeed without degraded latency.
3.  No lingering error spikes in logs.
4.  Health checks back to `status: ok`.
5.  CI/CD deployments still functional.
6.  USTC upstream applications confirm successful transactions.
7.  Optional: Test locally with
    **USTC Pay Test Server**
    <https://github.com/ustaxcourt/ustc-pay-gov-test-server>

***

## 📝 7. Post-Incident Actions

Within 24–48 hours:

1.  Write a **Post‑Incident Report** including:
    *   Summary of impact
    *   Timeline
    *   Root cause
    *   Fixes applied
    *   Follow-up items
    *   Lessons learned

2.  File issues for:
    *   Documentation updates
    *   Missing monitoring
    *   Test coverage gaps
    *   Architectural adjustments
    *   DX improvements

3.  Update:
    *   `/docs/architecture/overview.md` (if workflows changed)
    *   `/docs/security/threat-model.md` (if risk surface changed)

***

## 🧰 8. Useful Tools & Commands

### Health check

```bash
curl -sS $BASE_URL/v1/health
```

### Initiate test transaction

```bash
curl -sS -X POST "$BASE_URL/v1/transactions/initiate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "feeId": "FEE-TEST", "amount": 1.00, "referenceId": "test-123",
        "successUrl": "https://example/success", "cancelUrl": "https://example/cancel" }'
```

### Check logs (example)

*(Adjust per environment.)*

```bash
aws logs tail /aws/lambda/payment-portal --follow
```

***

## 📌 9. When to Escalate

Escalate if:

*   Issue persists > 20 minutes for SEV‑1
*   Payments are completing incorrectly
*   Redirect URLs are malformed
*   Tokens not matching expected lifecycle
*   Repeated SOAP failures with high impact
*   Incident involves **security concerns** (stop and follow `SECURITY.md`)

***

## 📚 Related Documents

*   `/SECURITY.md`
*   `/CONTRIBUTING.md`
*   `/docs/architecture/overview.md`
*   `/docs/security/threat-model.md`
*   `/docs/deployment/promotions.md`

***

## 🙏 Thank You

Effective, calm, documented incident management helps keep payments reliable for all USTC systems.
If you find gaps in this runbook, please submit a **Documentation Update** issue.
