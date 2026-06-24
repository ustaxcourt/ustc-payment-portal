---
name: generate-pr-summary
description: "Generate a concise, well-structured pull request summary for the current branch. Use when: asked to write or fill out a PR description; summarizing a diff or commit log into the repo's PR template; preparing a branch for review. NOT for: opening the PR itself (use the create-pull-request skill); planning a change before coding (use generate-implementation-plan)."
argument-hint: "Optionally name the branch, ticket, or scope to summarize"
---

# Generate PR Summary

## When to Use

- User says "write a PR summary", "fill out the PR description", "summarize this branch", or "draft the PR body"
- A branch is ready for review and needs its description populated
- You need to turn a diff or commit log into the team's PR template

Do NOT use this skill to open or push the PR — that is the `create-pull-request` skill's job.

## Template

This repo's PR template is the source of truth for section structure:

- [.github/pull_request_template.md](../../pull_request_template.md)

Always read that file first and mirror its headings exactly. If the template changes, the generated summary must follow the new structure — do not hardcode a section list from memory.

## Procedure

### 1. Read the template

Read [.github/pull_request_template.md](../../pull_request_template.md) in full and use its headings (`# Summary`, `## What Changed?`, `## Testing`, `## Out of Scope / Follow-up Tickets`, etc.) verbatim. Keep the template's HTML comments out of the final output unless the user wants the scaffold preserved.

### 2. Gather the diff

- Scope the diff to the branch's actual changes, not unrelated baseline drift:
  `PAGER=cat git diff --stat <base> -- <task paths>`
- Read the key changed files to describe behavior accurately — do not rely on filenames alone.
- Prefer the commit log and diff over assumptions about what changed.

### 3. Write the summary

- **# Summary**: 2–5 sentences. What the PR does and why, plus the user-facing or system-level behavior that changed. Save implementation detail for "What Changed?".
- **## What Changed?**: group changes as vertical slices (a feature, a layer, a config concern) rather than per-file. Rename/add/remove the example subsections to match this PR. Use specific names: column names, function names, type names, endpoint paths, file names. Remove any subsection with nothing to report. Do not editorialize or repeat across sections.
- **## Testing**: what tests were added/updated/removed and why. If none changed, state how the change was verified (e.g. `terraform fmt`/`validate`, manual smoke check).
- **## Out of Scope / Follow-up Tickets**: only real, confirmed JIRA tickets. Use the format `Short description - **PAY-###** ...`. Delete the section if empty.

### 4. Output

Write the summary into a file (e.g. `PR_SUMMARY.md`) or directly into the chat per the user's preference. Use linkified file references (`[path/file.tf](path/file.tf)`); never use backtick filenames.

## Key rules

- Mirror the headings from [.github/pull_request_template.md](../../pull_request_template.md) — never invent a different structure.
- Keep it concise; the Summary is 2–5 sentences, not a changelog.
- Be specific — name the resources, variables, files, and behaviors that changed.
- Never list a follow-up ticket that does not already exist in JIRA. If a follow-up seems needed but has no ticket, flag it to the developer rather than inventing a number.
- Flag external dependencies (Pay.gov allowlisting, certificate/SOAP changes, manual prod applies) explicitly in Out of Scope / Follow-up.
