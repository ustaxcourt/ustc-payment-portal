# Contributing to USTC Payment Portal

Thank you for your interest in contributing to the **USTC Payment Portal**!
We welcome improvements in code, documentation, testing, architecture, and developer experience.

This document outlines how to contribute effectively and responsibly.

---

## 🚀 Ways to Contribute

You can help by:

- Reporting bugs
- Suggesting enhancements
- Improving documentation
- Adding or improving tests
- Contributing code changes
- Refining architecture or workflows

If you’re not sure where to start, look at issues labeled **good first issue**, **help wanted**, or **documentation**.

---

## 🛠 Development Setup

See **running-locally.md** in the repo root for detailed setup instructions.

General requirements:

- Node.js (version from `.nvmrc`)
- npm or yarn
- Docker (optional, for local service mocks)
- Access to the USTC Pay Test Server if needed
  → **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)**

---
## 🔀 Branching, Workflow & PRs

### Branching Strategy

All work should be done in **feature branches** created from `main`.
Branches must include a **work type prefix** and a **ticket identifier**, but the ticket format depends on the system where the work item originated (e.g., GitHub Issues, Jira, internal systems).

### Examples

Use one of the following formats depending on where the ticket lives:

    # GitHub Issue
    feat/1234-add-transaction-logging
    bugfix/987-fix-timeout-behavior
    docs/42-update-api-reference

    # Jira or other system with key prefixes
    feat/PAY-1234-add-transaction-logging
    bugfix/PAY-567-fix-timeout-behavior
    docs/PAY-88-update-api-reference

    # Internal lightweight issue IDs
    feat/issue1-add-transaction-logging
    docs/issue17-update-api-reference

### Notes

*   Always start branches with one of the standard prefixes:
    `feat/`, `bugfix/`, `docs/`, `refactor/`, `chore/`, `test/`.
*   Use **kebab-case** for readability.
*   The ticket identifier should be the first element after the prefix.
*   If unsure which identifier to use, match the system where the ticket originated.

### Commit Messages
Follow **Conventional Commits**:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `refactor:` internal improvements
- `test:` test additions or refactors
- `chore:` maintenance/update tasks

### Pull Requests
A good PR includes:

- A clear description of *what* and *why*
- Linked issues (e.g., `Closes #123`)
- Tests for new or changed behavior
- Updated documentation (when applicable)
- Passing CI checks

Your PR will be reviewed by maintainers using GitHub’s PR workflow.

---

## 🧪 Testing

We use **Jest** for unit and integration tests.

Before submitting a PR:

```

npm test
npm run test:coverage

```

See **COVERAGE.md** for more details.

---

## 🔒 Security Reporting

Please **DO NOT** create GitHub issues for security vulnerabilities.

Instead, follow the instructions in:

👉 **SECURITY.md**

---

## 📚 Documentation Improvements

Documentation contributions are highly appreciated. Aside from the root-level README, consider updates to:

- `/docs/`
- Architecture materials
- API reference
- Integration guides
- Runbooks (ops)

---

## 🧭 Project Structure Overview

Some key directories:

```

/src               Source code
/docs              Documentation
/terraform         Infra and deployment config
/.adr-dir          Architecture decision records
/tests             Automated tests

```

The related mock service:

- **[USTC Pay Test Server](https://github.com/ustaxcourt/ustc-pay-gov-test-server)**
  Used for simulating Pay.gov behavior in development and testing.

---

## 🧑‍🤝‍🧑 Code of Conduct

By participating, you agree to follow the project’s:

👉 **CODE_OF_CONDUCT.md**

We aim to maintain a welcoming, respectful community.

---

## 🙌 Thank You

Your contributions help keep the U.S. Tax Court ecosystem reliable and secure for all users.

We appreciate your time, expertise, and collaboration!
```
