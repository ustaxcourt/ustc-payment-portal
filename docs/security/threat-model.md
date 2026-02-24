# USTC Payment Portal — Security Threat Model

> **Scope:** This document models threats to the **USTC Payment Portal** and its integrations with upstream USTC applications and Pay.gov. It focuses on transaction initiation, redirect flows, and completion, plus CI/CD and infrastructure considerations.

Related repos:

*   **[USTC Payment Portal](https://github.com/ustaxcourt)**
*   **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)**

***

## 1) System Context & Data Flows

**Primary flows**

1.  **Initiate:** USTC App → *Portal* → Pay.gov `startOnlineCollection` → *Portal* → USTC App returns `{ token, redirectUrl }`.
2.  **Redirect:** User → Pay.gov HCP UI (success/cancel) → User → USTC App route (`successUrl`/`cancelUrl`).
3.  **Complete:** USTC App → *Portal* → Pay.gov `completeOnlineCollection` → *Portal* → USTC App (tracking/receipt data).

**Key properties**

*   The Portal **does not** collect or process PAN/cardholder data; Pay.gov handles payment UI and PCI scope.
*   The Portal handles **tokens**, **redirect URLs**, and **tracking IDs** only.

***

## 2) Assets & Security Objectives

**Primary assets**

*   **Transaction tokens** (Pay.gov session identifiers)
*   **Redirect URLs** (destination to HCP with token)
*   **Tracking IDs / receipts** (non‑PAN proof of completion)
*   **Auth credentials** (Bearer tokens for Portal API; downstream credentials)
*   **Configuration & secrets** (environment variables, Terraform state, CI secrets)
*   **Build artifacts** (immutable bundles/images)
*   **Logs/metrics** (must avoid PII/PAN and secrets)

**Objectives**

*   **Confidentiality:** protect tokens, credentials, internal config, and any user metadata.
*   **Integrity:** prevent tampering of requests, redirects, and completion responses.
*   **Availability:** maintain initiation and completion under expected load; degrade safely.
*   **Non‑repudiation / auditability:** correlation IDs, immutable artifacts, verifiable releases.

***

## 3) Trust Boundaries

*   **Boundary A — USTC Application ↔ Portal (REST over HTTPS):** Auth via Bearer tokens; input validation and rate limiting on the Portal.
*   **Boundary B — Portal ↔ Pay.gov (SOAP over TLS):** WSDL/XSD‑based contract; network egress controls; SOAP fault handling.
*   **Boundary C — User Agent ↔ Pay.gov HCP:** User interaction handled externally by Pay.gov UI.
*   **Boundary D — CI/CD & Artifact Store:** Build, sign, store, and promote immutable artifacts across environments.
*   **Boundary E — Secrets Management:** Rotation/least privilege for credentials used by the Portal and CI.

***

## 4) Threat Enumeration (STRIDE)

Below are representative threats per category with recommended mitigations (✅ = implemented/expected; 🔶 = recommended to implement/verify).

### Spoofing

*   **S1. Caller impersonation:** Unauthenticated or forged clients call Portal endpoints.
    **Mitigations:** ✅ Bearer auth; 🔶 mTLS (optional); 🔶 IP allow‑listing for server‑to‑server callers.
*   **S2. Pay.gov endpoint spoofing:** DNS/host compromise or mis‑config sends SOAP to an attacker.
    **Mitigations:** ✅ TLS + hostname pinning checks where feasible; 🔶 restrict egress to known endpoints; 🔶 monitor cert changes.

### Tampering

*   **T1. Redirect URL tampering:** Manipulating `redirectUrl` or its parameters.
    **Mitigations:** ✅ Server‑side generation of redirect URL; 🔶 sign parameters or embed HMAC; ✅ validate `successUrl`/`cancelUrl` scheme/host.
*   **T2. Token replay/tampering:** Reusing tokens or altering token fields.
    **Mitigations:** ✅ Idempotency keys; ✅ token state checks on `complete`; 🔶 add token age/expiry checks and strict equality on `referenceId`.

### Repudiation

*   **R1. Disputed actions without traceability.**
    **Mitigations:** ✅ Correlation IDs per request; ✅ structured logging; 🔶 signed audit events persisted with retention; 🔶 clock sync validation.

### Information Disclosure

*   **I1. Logs reveal secrets/tokens/PII.**
    **Mitigations:** ✅ Log scrubbing; ✅ avoid PAN/PII; 🔶 runtime detectors for secrets; 🔶 separate high‑cardinality fields.
*   **I2. Error messages leak internals.**
    **Mitigations:** ✅ Normalized error model; ✅ hide stack traces; 🔶 content security policy (if any UI), strict headers on any static endpoints.

### Denial of Service

*   **D1. Request floods to initiation/completion.**
    **Mitigations:** 🔶 Rate limiting per caller; 🔶 circuit breakers/timeouts for SOAP; ✅ idempotency to avoid re‑work; 🔶 autoscaling or quotas.
*   **D2. Downstream slowness (Pay.gov) propagates upstream.**
    **Mitigations:** ✅ timeouts with exponential backoff; 🔶 bulkheads and queues; 🔶 graceful degradation messages.

### Elevation of Privilege

*   **E1. Over‑privileged roles or CI secrets.**
    **Mitigations:** ✅ least privilege IAM; 🔶 periodic access review; 🔶 short‑lived credentials; 🔶 OIDC‑based CI federation instead of long‑lived keys.
*   **E2. Dependency or supply‑chain compromise.**
    **Mitigations:** ✅ Dependabot/CodeQL; 🔶 provenance (SLSA‑style) for artifacts; 🔶 package integrity (npm lockfile verification); 🔶 pre‑prod signature verification.

***

## 5) Abuse & Misuse Cases

*   **A1. Redirect poisoning:** Attacker tries to set `successUrl`/`cancelUrl` to untrusted origins.
    **Control:** Strict allow‑list for return domains; require HTTPS; reject IP‑literal URLs.
*   **A2. Token guessing:** Brute force of token values to complete transactions.
    **Control:** Token entropy belongs to Pay.gov; Portal must rate‑limit `complete` and validate token state/reference pairing.
*   **A3. Idempotency race:** Multiple retries with conflicting payloads under same `Idempotency-Key`.
    **Control:** Enforce **payload hash + key** binding and return first result for identical inputs.
*   **A4. Replay after completion:** Reusing a `token` post‑completion.
    **Control:** Server‑side token state machine enforces single completion path.
*   **A5. SOAP SSRF attempts:** Malicious fields lead the Portal to contact unintended hosts.
    **Control:** Hard‑code or allow‑list Pay.gov endpoints; no dynamic SOAP endpoints from user input.

***

## 6) Controls & Hardening Checklist

### Application Layer

*   ✅ **Auth:** Bearer token required; validate issuer/audience/expiry (**TODO:** confirm token validation strategy).
*   ✅ **Input validation:** Schemas for `initiate`/`complete`; strict URL checks.
*   ✅ **Idempotency:** `Idempotency-Key` support; replay returns prior result.
*   ✅ **Error normalization:** No internal details leaked; correlationId returned.
*   🔶 **Output encoding:** Sanitize any strings reflected back (defense in depth).
*   🔶 **Header security (if any UI):** HSTS, CSP, X‑Content‑Type‑Options, Referrer‑Policy.

### Transport & Network

*   ✅ **TLS everywhere** (REST & SOAP).
*   🔶 **Egress restrictions** to Pay.gov hosts only; firewall rules / security groups.
*   🔶 **mTLS** for high‑assurance service‑to‑service (optional, evaluate operational cost).

### Secrets & Configuration

*   ✅ **No secrets in repo**; use environment/secret store.
*   🔶 **Rotation policy** (document cadence, alert on age).
*   🔶 **Scopes/least privilege** for each environment.
*   🔶 **Prevent secret echo** in logs and error paths.

### Logging & Telemetry

*   ✅ **Structured logs** with `correlationId`.
*   ✅ **PII/PAN avoidance**; scrub headers/params.
*   🔶 **Anomaly detection** (error‑rate SLOs; spike alerts).
*   🔶 **Downstream health** metrics (timeout, fault types, latency buckets).

### CI/CD & Supply Chain

*   ✅ **Immutable artifacts**; promote same build across envs.
*   🔶 **Provenance** (attestations/signing) for artifacts; store digests with release notes.
*   ✅ **Dependency monitoring** (Dependabot/CodeQL); fail on critical vulns.
*   🔶 **Lockfile integrity** checks in CI.
*   🔶 **Pinned actions** (use commit SHAs for GitHub Actions, avoid `@latest`).

### Infrastructure

*   🔶 **Drift detection** for Terraform; review plan outputs.
*   🔶 **Least privilege IAM** for runtime & CI; periodic audit.
*   🔶 **WAF / API gateway** rate limits and request size limits.
*   🔶 **Backup/restore** for config state and logs.

***

## 7) Data Classification & Retention

*   **Payment data:** PAN/PIN never handled; **out of scope** here.
*   **Transactional metadata:** Keep minimal necessary fields (token refs, tracking IDs, timestamps); set **retention** (e.g., 90 days) and purge schedules. **TODO:** define retention.
*   **Logs/metrics:** Exclude secrets and PII; set retention/archival by environment.
*   **Artifacts:** Retain release artifacts and SBOMs for audit (e.g., 1–3 years). **TODO:** confirm policy.

***

## 8) Environment Matrix

| Area        | Local                    | Dev                       | Staging          | Prod                         |
| ----------- | ------------------------ | ------------------------- | ---------------- | ---------------------------- |
| Downstream  | **USTC Pay Test Server** | Test Server / Pay.gov Dev | Pay.gov Pre‑Prod | Pay.gov Prod                 |
| Secrets     | Local `.env` (dev only)  | Secret store (scoped)     | Secret store     | Secret store                 |
| Logging     | Verbose                  | Standard                  | Standard         | Standard                     |
| Rate limits | Off                      | Low                       | Medium           | As required                  |
| mTLS        | Off                      | Optional                  | Optional         | Optional/Required (evaluate) |

> **TODO:** Fill exact hosts, secret providers, and policies per environment.

***

## 9) Validation & Test Strategy

*   **Contract tests:** Ensure SOAP envelopes conform to WSDL/XSD; assert error mapping.
*   **Security tests:** Negative tests (invalid URLs, token reuse, idempotency races); boundary fuzzing for fields.
*   **Performance tests:** Load on `initiate`/`complete` with realistic patterns; verify timeouts/backoff.
*   **Chaos/Resilience:** Inject downstream latency/faults; validate circuit breakers and user‑visible behavior.
*   **SCA/SAST:** Block high/critical dependency vulns; scan code paths with CodeQL.
*   **Secrets scanning:** Pre‑commit & CI scans; fail builds on matches.

***

## 10) Incident Playbooks (Pointers)

*   **Operational incidents:** `/docs/runbooks/incident-response.md`
*   **Security incidents:** `/SECURITY.md` (private reporting & safe‑harbor)

In any incident, capture `correlationId`, environment, and recent release/tag info for triage speed.

***

## 11) Open Risks & TODOs

*   **R‑01:** Finalize token expiry policy and enforce in `complete`.
    *   *Action:* Add config + unit/integration tests.
*   **R‑02:** Implement explicit domain allow‑list for `successUrl`/`cancelUrl`.
    *   *Action:* Add centralized validator + config.
*   **R‑03:** Artifact signing/provenance (SLSA‑style) not yet enforced.
    *   *Action:* Add build attestation; store with release.
*   **R‑04:** Egress allow‑listing to Pay.gov endpoints pending infra update.
    *   *Action:* Add SG/WAF rules; verify in staging.
*   **R‑05:** Secrets rotation cadence undefined.
    *   *Action:* Document and automate rotation.

***

## 12) Change Management

*   Update this threat model when:
    *   New endpoints or parameters are added
    *   Authentication/authorization schemes change
    *   Infrastructure or CI/CD processes change
    *   New third‑party dependencies are introduced

Link related ADRs in `/.adr-dir` and summarize security impacts in PR descriptions.

***

### Appendix A — Reference Sequences (Text)

**Initiate (simplified)**
`USTC App` → **Portal** (REST `/initiate`) → **Portal** → `Pay.gov (SOAP start)` → **Portal** → `USTC App` `{ token, redirectUrl }`

**Complete (simplified)**
`USTC App` → **Portal** (REST `/complete`) → **Portal** → `Pay.gov (SOAP complete)` → **Portal** → `USTC App` `{ status, trackingId }`

