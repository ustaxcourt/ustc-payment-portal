# Support & Getting Help

Thank you for using the **USTC Payment Portal**.
This document explains how to get help, where to report issues, and how to request enhancements.

---

## 📬 Where to Ask Questions

If you have questions about using or integrating with the Payment Portal, you can:

- Open a **Q&A issue** in this repository
  *(Use GitHub Issues only for non‑sensitive questions.)*

- Contact the Payment Portal engineering team
  via your internal USTC communication channels
  *(Slack/Teams channel name can be added here if applicable.)*

For integration questions, please review:

- `README.md`
- `running-locally.md`
- `/docs/architecture/overview.md`
- `/docs/api/reference.md`

These contain the most up‑to‑date technical guidance.

---

## 🐞 Reporting Bugs

To report a bug, open a GitHub Issue using the **Bug Report** template.

Before filing:

1. Search existing issues to avoid duplicates.
2. Include clear reproduction steps.
3. Sanitize logs — remove secrets, tokens, or PII.
4. Mention the environment (local, dev, staging, prod).

If the bug appears to affect payment completion or token handling, please label the issue with:

```
impact:payments
```

and include integration logs where possible (again, sanitized).

---

## ✨ Requesting Features or Enhancements

Use the **Feature Request** template when:

- You want new capabilities in the Payment Portal.
- You have integration needs not currently supported.
- You want to improve developer experience, testing, or infrastructure.

Good feature requests include:

- A clear problem statement
- Expected outcomes
- Any constraints or regulatory requirements
- API or workflow examples, if applicable

---

## 🔒 Reporting Security Vulnerabilities

**Do NOT create a GitHub Issue for security problems.**

Instead, refer to:

👉 `SECURITY.md`

This document explains how to privately report vulnerabilities.

Security-related issues MUST be handled privately and coordinated with maintainers.

---

## 🛠 Operational / On‑Call Issues

If you believe a production issue is occurring (timeouts, failing transaction completions, unexpected Pay.gov behavior, etc.):

1. Follow your organization’s established **incident escalation path**.
2. Use the runbook at:
   `/docs/runbooks/incident-response.md`
3. Contact the on‑call engineer (if applicable).

Operational issues should not be filed as standard GitHub Issues until the incident is concluded.

---

## 🧭 Documentation Support

If you find missing, outdated, or unclear documentation:

- Open a **Documentation Update** issue.
- Provide links or paths so maintainers can quickly identify what needs revision.

Documentation files live under:

```
/docs
```

---

## 🧑‍🤝‍🧑 Maintainer Contact

Maintainers are listed in:

👉 `/MAINTAINERS.md`

Please contact maintainers directly **only for items that cannot be handled in Issues**, such as:

- Sensitive operational questions
- Dependency upgrade coordination
- System architecture concerns
- Legal or compliance‑related inquiries

---

## 🙏 Thank You

Your feedback, reports, and questions help improve the reliability and clarity of the USTC Payment Portal ecosystem.
We appreciate your time and collaboration!
