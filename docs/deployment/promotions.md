# Deployment & Promotion Process
USTC Payment Portal

This document describes how code moves from development → staging → production, how build artifacts are handled, and what checks must be completed before promotion. It is intended for engineers responsible for releasing and verifying updates to the **USTC Payment Portal**.

---

## 🎯 Goals of the Promotion Process

- Ensure **safe, consistent, reproducible** deployments.
- Guarantee that **the same artifact** tested in staging is the one deployed to production.
- Reduce human error through automation and clear requirements.
- Maintain traceability and auditability across environments.

---

## 📦 Build Artifacts

The Payment Portal uses an artifact-based deployment flow. A single commit produces:

- A versioned build artifact (npm bundle, zipped Lambda package, or container image depending on current infra).
- A GitHub Release or Release Candidate tag.
- An S3-stored bundle or image digest (depending on infra).

Artifacts generated at commit time are:

- Immutable
- Named deterministically
- Traceable through the entire pipeline

**Important:** A production deployment must always use the **same artifact** that passed staging validation.

---

## 🧭 Environment Overview

| Environment | Purpose | Notes |
|------------|---------|------|
| **Development** | First deployment target for new code | Used by engineers; may point to the USTC Pay Test Server |
| **Staging** | Mirrors production behavior | All release candidates must pass here |
| **Production** | Live environment | Only promoted artifacts are allowed |

The Payment Portal’s downstream interactions (Pay.gov or **USTC Pay Test Server**) vary based on environment configuration.

---

## 🚀 Deployment Flow (High-Level)

1. **Commit merged to `main`**
   - CI runs tests and builds an artifact.
   - CI uploads the artifact to the artifact store (e.g., S3 or container registry).
   - CI creates a GitHub Release Candidate (RC) tag such as:
     ```
     vYYYY.MM.PATCH-rc.N
     ```

2. **Deploy to Development**
   - CI automatically deploys the RC artifact to the Dev environment.
   - Smoke tests run against the deployment.

3. **Promote to Staging**
   - A promotion workflow deploys the *same artifact* to Staging.
   - Additional validation occurs:
     - End‑to‑end tests
     - SOAP downstream checks
     - Network & environment variable verification
     - Redirect URL validation
     - Audit/log format validation
     - Performance checks (if configured)

4. **Verification Gate**
   Staging must show successful results in:
   - Health checks
   - Logs (no unexpected error clusters)
   - Manual or automated transaction flow:
     initiate → redirect → complete → tracking ID
   - Terraform drift check (optional but recommended)

5. **Create Production Tag**
   Once validated, maintainers create the final version tag on the **same commit** as the RC:

````

vX.Y.Z

````

This ensures the production build is identical to the tested artifact.

6. **Promote to Production**
- CI deploys the artifact associated with `vX.Y.Z`.
- Perform "post-deployment checks" (see below).

---

## 🧪 Pre-Promotion Checklist (Staging → Production)

Before cutting a production tag:

### Functional Validation
- [ ] Initiate/redirect/complete flow works end‑to‑end
- [ ] SOAP request/response formatting validated
- [ ] No unexpected validation errors

### Logs & Monitoring
- [ ] No spikes in `5xx` or `DOWNSTREAM_ERROR` logs
- [ ] No authentication/authorization anomalies
- [ ] Correlation IDs trace consistently

### Configuration Verification
- [ ] Environment variables match expected values
- [ ] Secrets valid and rotated if required
- [ ] Terraform drift check clean (optional)

### Release Integrity
- [ ] Artifact hash/digest matches Dev + Staging
- [ ] RC tag corresponds to commit intended for release
- [ ] Breaking changes documented (or none exist)
- [ ] All required code reviews complete

---

## 🧩 Production Deployment

Once the final tag (`vX.Y.Z`) is created:

1. CI picks up the tag, fetches the **associated artifact**, and deploys it to production.
2. Deployment logs should list:
- Commit SHA
- Artifact hash
- Time of deployment
- Environment variables (non-secret subset)
- Downstream endpoints

3. The deployment job should run **post-deployment health checks**:

```bash
curl -sS https://payment-portal.example.gov/v1/health
````

4.  Perform a manual validation:
    *   Initiate a low-value test transaction
    *   Confirm correct redirect
    *   Complete the transaction
    *   Ensure correct tracking ID return

5.  Notify stakeholders that the deployment is complete.

***

## 🔄 Rollback Procedure

If production tests fail or errors spike:

1.  Immediately halt traffic if applicable (API Gateway throttling or fast rollback).
2.  Redeploy the **previous stable version artifact**, usually the prior tag:
        vX.Y.(Z-1)
3.  Verify health checks again.
4.  Communicate rollback status to stakeholders.
5.  Open a post-incident analysis ticket (see `incident-response.md`).

Rollback MUST use artifacts, not new builds. Rebuilding introduces risk.

***

## 🧼 Cleaning Up Old Artifacts

Periodic cleanup tasks may include:

*   Removing older RC artifacts
*   Rotating secret-based variables or tokens
*   Archiving logs from staging/dev
*   Pruning unused Terraform state references

A cleanup schedule (e.g., monthly) keeps the environment secure and tidy.

***

## 📚 Related Documents

*   `/docs/runbooks/incident-response.md`
*   `/docs/security/threat-model.md`
*   `/docs/architecture/overview.md`
*   `/docs/api/reference.md`
*   `/SECURITY.md`

***

## 🙏 Thank You

A disciplined promotion process keeps deployments predictable and reduces operational and security risk.
If you see gaps in this procedure, please open a **Documentation Update** issue.
