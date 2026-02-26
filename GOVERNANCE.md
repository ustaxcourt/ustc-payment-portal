# Project Governance
USTC Payment Portal

This document defines how decisions are made, how maintainers collaborate, and how the USTC Payment Portal project is stewarded. It ensures clarity, consistency, accountability, and secure long‑term maintenance of the system.

---

## 1. Purpose

This governance model ensures that:

- Technical decisions are made consistently and transparently
- Contributors understand how changes are evaluated
- Security and stability remain the top priority
- Releases and architecture evolve deliberately and safely
- Maintainers have a shared and documented understanding of their responsibilities

Governance applies to **all code, documentation, infrastructure, workflows, and processes** in this repository.

---

## 2. Roles

### 2.1 Maintainers

The maintainers are the individuals who belong to:

**GitHub Team:**
`@ustaxcourt/payment-portal-team`

Maintainers have Write/Admin access to the repository and are responsible for:

- Reviewing and approving pull requests
- Maintaining code quality and architectural consistency
- Performing or approving releases and promotions
- Responding to incidents and participating in post‑incident reviews
- Coordinating security-sensitive changes
- Ensuring documentation remains accurate and up to date
- Guiding the long‑term direction of the project

The authoritative list of maintainers is the membership of the GitHub team above.

For more details, see:
**`/MAINTAINERS.md`**

---

### 2.2 Contributors

Anyone who submits issues, patches, documentation, or feedback is a contributor.

Contributors must follow:

- **`/CONTRIBUTING.md`**
- **`/CODE_OF_CONDUCT.md`**

Contributors do not have merge permissions unless they are also maintainers.

---

### 2.3 Security Contacts

Security reviewers handle:

- Vulnerability reports
- Sensitive PR reviews
- Threat-model‑related changes
- Disclosure and mitigation workflow

Security processes are defined in:
**`/SECURITY.md`**

---

### 2.4 Upstream Stakeholders

USTC internal applications that depend on the Payment Portal are considered stakeholders. They may:

- Request new features
- Report issues
- Suggest improvements

Stakeholders provide input but do not have merge rights unless they are maintainers.

---

## 3. Decision-Making Model

### 3.1 Decision Types

| Type | Examples | Who Decides |
|------|----------|-------------|
| **Routine** | Minor fixes, small docs updates, refactors | Any Maintainer |
| **Technical** | Code structure, new modules, non-breaking feature work | Maintainers (majority) |
| **Security** | Auth changes, secret handling, mitigations | Maintainers + Security contacts |
| **Breaking** | API changes, workflow changes, user-visible changes | Maintainers (consensus) |
| **Governance** | Changes to governance, contributor rules | All Maintainers (consensus) |

---

### 3.2 Decision Workflow

1. **Proposal**
   - Create an Issue, PR, or ADR (`/.adr-dir`).
   - Provide context, alternatives, and rationale.

2. **Discussion**
   - Maintainers review, ask questions, and refine the plan.
   - Security/infrastructure SMEs are looped in when required.

3. **Approval**
   - Routine: One maintainer + passing CI.
   - Technical/security: Majority of maintainers.
   - Breaking changes/governance: Full consensus.

4. **Execution**
   - Update documentation and ADRs as needed.

5. **Release**
   - Follows the promotion process in:
     `/docs/deployment/promotions.md`

---

## 4. Architecture Decisions (ADRs)

Major decisions must be recorded as ADRs in:

```
/.adr-dir
```

ADRs must include:

- Context
- Decision
- Alternatives
- Consequences
- Links to related issues or PRs

ADRs require maintainer consensus for approval.

---

## 5. Release Governance

Releases follow the process defined in:

- `/docs/deployment/promotions.md`

Maintain strict requirements:

- Only tested and validated artifacts are promoted
- Staging must pass verification before production promotion
- Rollbacks must use the previously released artifact, not a rebuild
- Release notes and version tags must reflect actual state

Maintainers are responsible for release safety.

---

## 6. Security Governance

Security policies and procedures are defined in:

- `/SECURITY.md`
- `/docs/security/threat-model.md`
- `/docs/runbooks/incident-response.md`

Security-sensitive changes must:

- Undergo additional review
- Not be rushed through without discussion
- Include threat‑model updates when needed
- Avoid introducing new attack surfaces without justification

---

## 7. Modifying Governance

Changes to this governance model require:

- A PR describing the modification
- Review by all maintainers
- Full maintainer consensus
- Updates to related documents (`CONTRIBUTING.md`, etc.)

No governance changes may be merged without these approvals.

---

## 8. Conflict Resolution

If disagreement arises:

1. Discuss in the PR or Issue.
2. Escalate to synchronous discussion if needed.
3. If still unresolved:
   - For routine/technical decisions: majority of maintainers.
   - For security decisions: security contacts have final authority.
   - For governance or breaking changes: consensus required.

---

## 9. Thank You

This project depends on clear, collaborative, and responsible governance.
Thank you to all maintainers and contributors who help keep the USTC Payment Portal secure, stable, and well‑maintained.
