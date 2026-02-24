# USTC Payment Portal — Architecture Overview

This document provides a technical overview of the **USTC Payment Portal** system architecture, data flows, components, and integration points.

---

## 🎯 Purpose

The Payment Portal acts as a trusted intermediary between:

- USTC internal applications
- Pay.gov’s Hosted Collection Pages SOAP API

The portal simplifies integrations by exposing a consistent API while handling the SOAP interface, token exchanges, redirect URLs, and transaction completion.

---

## 📦 High‑Level System Components

### 1. USTC Applications (Clients)
These initiate transactions and consume the final transaction results.
They interact with the Payment Portal via HTTP API requests.

### 2. Payment Portal (This Repo)
Source: **[USTC Payment Portal](https://github.com/ustaxcourt)**

Responsibilities:

- Accept transaction initiation requests
- Construct and send SOAP `startOnlineCollection` and `completeOnlineCollection` messages
- Generate Pay.gov redirect URLs
- Validate callback logic and process completion flow
- Return tracking data to the originating USTC application
- Provide environment-aware configuration and secrets management
- Log, audit, and support development/test environments

### 3. Pay.gov Hosted Collection Pages
External government service handling payment processing.
The portal communicates with Pay.gov via SOAP, using WSDL/XSD definitions.

### 4. Pay.gov Development Mock (Test Server)
For local development or CI testing, the system uses a simulated Pay.gov server:
**[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)**

It mimics SOAP endpoints, returns mock tokens, and exposes a test UI that mimics success/cancel flows.

---

## 🔄 Core Workflow Overview

### **1. Initiate a Transaction**
1. USTC app sends request → Payment Portal
2. Portal sends SOAP `startOnlineCollection` to Pay.gov (or test server)
3. Pay.gov responds with a **token**
4. Portal builds redirect URL
5. Portal returns `{ token, redirectUrl }` to originating app

### **2. User Completes or Cancels Payment**
- User is redirected to Pay.gov HCP UI
- After completion/cancel, Pay.gov redirects user to `successUrl` or `cancelUrl` defined on initiation

### **3. Finalize / Complete Transaction**
1. USTC application calls portal to finalize
2. Portal calls Pay.gov SOAP `completeOnlineCollection`
3. Portal receives **Tracking ID**
4. Portal returns a normalized response to the USTC application

Sequence diagrams will be added as the v2 workflow stabilizes.

---

## 🧱 Internal Architecture Components

### API Layer (`/src`)
- HTTP handlers (REST endpoints)
- Validation of request payloads
- Response shaping and error mapping
- Logging, tracing, and correlation IDs

### SOAP Client Layer
- SOAP envelope generation
- WSDL/XSD‑driven schema validation
- Fault and error normalization
- Token and transaction handling

### Configuration & Environment Management
- Environment variables
- Secrets (tokens, credentials)
- Mode selection: local → dev → staging → prod

### Infrastructure (`/terraform`)
- AWS infrastructure (S3 artifact storage, Lambda/API Gateway or EC2, domain config, etc.)
- Deployment pipelines
- Role‑based access and secrets management

### CI/CD
- Artifact builds tracked per commit
- Tag‑driven publish flow to npm or container registry (see Releases)
- Integration tests may target the **USTC Pay Test Server**

---

## 🧪 Development Flows

### Local
- Portal runs on localhost
- Pay.gov behavior simulated via the
  **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)**
- Useful for debugging SOAP envelopes, redirect behavior, and callbacks

### Cloud Development
- Deployed dev instance configured via Terraform
- Points at deployed version of the test server

### Staging / Production
- Artifact-based deployments
- Identical artifacts promoted across environments

---

## 🔐 Security Model (Summary)

- Communication with Pay.gov over secure SOAP endpoints
- Environment-specific access tokens
- Strict separation between dev/staging/prod
- No payment data handled directly — Pay.gov hosts all user-facing payment interfaces
- Internal logging excludes PII and sensitive payment info

See `SECURITY.md` for the complete policy.

---

## 🧭 Related Repositories

- **[USTC Payment Portal](https://github.com/ustaxcourt)** – This system
- **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)** – Mock Pay.gov SOAP server for development/testing

---

## 📌 Future (v2) Architecture

A next‑generation workflow is under development to:

- Provide a more flexible initiation API
- Standardize fee identification via `feeId`
- Improve callback handling and reliability
- Provide more metadata and telemetry
- Improve integration experience for USTC application teams

As components mature, additional diagrams and ADRs will be added to the `/docs/architecture/` directory.

---

## 📝 Change History

Architectural decisions are tracked via ADRs in:

```
/.adr-dir
```

Please consult these when designing new features or proposing major changes.
