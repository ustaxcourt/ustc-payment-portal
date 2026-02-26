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

### Branching
- Use feature branches from `main`
- Example:
```

PAY-1234-add-transaction-logging
PAY-1232-bugfix/fix-timeout-behavior
PAY-1231-docs/update-api-reference

```

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
npm run coverage

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
