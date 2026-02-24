# Security Policy

Thank you for helping keep the U.S. Tax Court ecosystem safe. We take the security of our users, data, and infrastructure seriously and appreciate coordinated disclosures.

> - Email suspected vulnerabilities to **security@ustaxcourt.gov** *(TODO: confirm mailbox)*.
> - Please do **not** open public issues for vulnerabilities.
> - We’ll acknowledge within **3 business days**, provide status updates at least **every 7 days**, and aim to remediate confirmed issues within **90 days** (or sooner for criticals).

---

## Reporting a Vulnerability

**Preferred channel:**
Send a detailed report to **security@ustaxcourt.gov** *(TODO: confirm or replace with your security mailbox or disclosure program link)* with:

- A clear description of the issue and **impact**.
- **Steps to reproduce** (PoC, requests/responses, screenshots, logs—redact sensitive data).
- **Affected components** and versions/commit SHAs.
- Any suggested **mitigations** or workarounds.
- Your preferred **attribution** (if you’d like recognition).

**Optional (encrypted reports):**
If you prefer encryption, use our **PGP public key** *(TODO: publish key & fingerprint, then link here)*.

> Please do **not** include production credentials, live personal data, or payment information in your report. If you believe you have encountered such data accidentally, stop testing and notify us immediately so we can coordinate a safe response.

---

## Coordinated Disclosure & Timelines

We follow a responsible/coordinated disclosure approach:

1. **Acknowledgment:** Within **3 business days** we’ll confirm receipt and provide a tracking ID.
2. **Triage:** We assess impact, affected scope, and exploitability. We may contact you for clarification or to coordinate safe testing.
3. **Remediation Plan:** For confirmed issues, we’ll outline a fix or mitigation path and an estimated timeline.
4. **Release & Advisories:** Once fixed, we’ll release patches and publish a security advisory (e.g., GitHub Security Advisory / GHSA). We may request up to **90 days** (shorter for criticals) from report to public disclosure. We’ll collaborate with you on timing.
5. **Credit:** With your permission, we’ll include researcher attribution in release notes/advisories.

> If an issue is being actively exploited or poses severe risk (e.g., RCE, auth bypass, sensitive data exposure), we may expedite timelines and apply temporary mitigations while a comprehensive fix is developed.

---

## Safe‑Harbor for Good‑Faith Research

We support good‑faith security research and **will not** pursue legal action for research that:
- Adheres to this policy and **avoids privacy violations** and service degradation.
- **Does not** access, modify, or exfiltrate data that you do not own.
- **Does not** impact availability (no DDoS, traffic floods, or destructive testing).
- **Does not** involve social engineering, phishing, physical intrusion, or spam.
- **Stops** immediately upon discovering exposure of live sensitive data and reports it privately.

Testing should be limited to:
- Publicly available endpoints of this repository’s deployed services in **non‑production** environments when available, or your own local instances.
- If in doubt about target scope, **ask first** via the reporting channel.

---

## Scope

This policy covers security issues in the **USTC Payment Portal** code and configuration hosted in this repository and its official deployments maintained by USTC.

**In scope examples**
- Authentication and authorization flaws (e.g., token misuse, privilege escalation).
- Input validation and injection (e.g., command/SQL/XXE).
- Sensitive data exposure (e.g., secrets in code, misconfigured TLS).
- Logic flaws in the **initiate** / **redirect** / **complete** payment workflows.
- SSRF, CSRF, clickjacking, request smuggling, caching issues.
- Supply‑chain vulnerabilities in our build, release, or IaC paths.

**Out of scope examples**
- Denial‑of‑service (volumetric) and rate‑limit testing.
- Social engineering of USTC staff or vendors.
- Physical security findings.
- Third‑party services (e.g., Pay.gov) not controlled by USTC—please report to the vendor.
- Low‑impact issues such as missing security headers that do not present exploitability in our context, or best‑practice suggestions without demonstrable risk.

> If you’re unsure whether something is in scope, please ask via the reporting channel.

---

## Supported Versions

We provide security fixes for the **latest minor release** and the **previous minor release** (rolling basis). Older releases may receive fixes at our discretion when the patch is low risk or required by policy.

| Version | Status         |
|--------:|----------------|
| Current `vX.Y.Z` *(TODO)* | **Supported** |
| Previous `vX.(Y-1).Z` *(TODO)* | **Supported** |
| Older   | Best‑effort / upgrade recommended |

> See [`CHANGELOG.md`](./CHANGELOG.md) and Releases for specific version information.

---

## Severity & Triage

We use **CVSS v3.1/v4.0** and contextual business impact to prioritize fixes:

- **Critical** – immediate attention; out‑of‑band release likely.
- **High** – prioritized for next release or expedited patch.
- **Medium/Low** – scheduled according to risk and roadmap.

We may request a proof‑of‑concept to confirm exploitability.

---

## Patch Distribution

- Fixes are released via normal tags/releases and may be accompanied by **GitHub Security Advisories (GHSA)**.
- We will provide **mitigation guidance** when a full patch is not immediately available.
- Downstream stakeholders may receive **pre‑disclosure** under embargo when operationally necessary (e.g., government partners). *(TODO: define process if applicable.)*

---

## Dependencies & Supply Chain

We continuously update and scan dependencies (e.g., Dependabot/CodeQL). If you identify:
- A vulnerable **transitive dependency** that affects this project.
- A weakness in our **build, CI/CD, or publishing** process (e.g., artifact integrity, provenance, secrets in workflows).

Please report it privately using the same process—these issues are **in scope** and appreciated.

---

## Secrets & Credentials

This repository should never contain live credentials or API keys. If you discover exposed secrets:
1. **Do not** attempt to use them.
2. **Do not** share or store the values.
3. Report the finding immediately; we will rotate and investigate exposure.

---

## Infrastructure & Environments

- The Payment Portal integrates with external payment services (e.g., Pay.gov). Only test against **approved development endpoints** or a **local environment**; do not target production services. *(TODO: add canonical non‑prod endpoints once published)*
- If you believe a production endpoint is impacted, contact us and **pause testing** so we can coordinate carefully.

---

## Contact & Attribution

- Primary: **security@ustaxcourt.gov** *(TODO: confirm)*
- Alternate: **[GitHub Security Advisory (private report)](https://github.com/USTaxCourt/ustc-payment-portal/security/advisories/new)** *(TODO: verify repo path/case)*

With permission, we are happy to **credit researchers** in advisories and release notes.

---

## Changes to This Policy

We may update this policy from time to time. Significant changes will be noted in the repository history and/or release notes.
