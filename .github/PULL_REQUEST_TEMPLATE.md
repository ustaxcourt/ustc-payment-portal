# Summary

<!-- A concise description of WHAT changed and WHY. Link issues like: Closes #123 -->

## Type of change
- [ ] Feature
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor / DX
- [ ] Security / Compliance
- [ ] CI/CD / Infrastructure

## Context & Motivation
<!-- Background, customer or stakeholder impact, related ADRs in /.adr-dir, and any alternatives considered. -->

## Screenshots / Logs (if UI or DX)
<!-- Add images or paste relevant logs (redact secrets). -->

---

## How to test locally

1. Start the **USTC Payment Portal** locally (this repo).
2. If needed, run the **USTC Pay Test Server** to simulate Pay.gov:
   - **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)**
3. Steps / commands:
```bash
  npm ci
  npm run build
  npm test
  # add any integration steps or curl examples here
```

## Test coverage

*   [ ] Unit tests added/updated
*   [ ] Integration/e2e tests added/updated
*   [ ] Coverage meets thresholds (see COVERAGE.md)
*   [ ] Negative tests for error paths and timeouts

***

## Security considerations

*   [ ] No secrets committed
*   [ ] Input validation and output encoding considered
*   [ ] AuthN/AuthZ implications reviewed
*   [ ] SOAP payloads validated against WSDL/XSD
*   [ ] No sensitive data in logs (tokens, PAN, PII)
*   [ ] If reporting a vulnerability, follow **SECURITY.md** (don’t use PRs)

## Backward compatibility

*   [ ] No breaking changes to public API
*   [ ] If breaking, documented migration notes and release plan

## Deployment / Rollout

*   [ ] No special ops steps
*   [ ] Requires infra/TF changes (document below)
*   [ ] Feature flagged / can be safely rolled back
*   [ ] Affects release notes

**Infra notes (if any):**

<!-- Terraform modules, variables, secrets, IAM, domains, etc. -->

***

## Documentation

*   [ ] README or `running-locally.md` updated if needed
*   [ ] `/docs/architecture/overview.md` updated if behavior changed
*   [ ] API docs updated (contract, examples, errors)
*   [ ] Runbooks / operational notes updated

***

## Checklist

*   [ ] Linked issue(s)
*   [ ] Self‑reviewed
*   [ ] `npm test` passes locally
*   [ ] CI green
