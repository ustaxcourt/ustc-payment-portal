---
name: generate-implementation-plan
description: "Generate a structured implementation plan for a feature, story, or technical change. Use when: asked to plan or design a change before coding; producing a plan for a GitHub issue or story; breaking down complex multi-file changes; identifying risks, moved blocks, migrations, or rollout dependencies before touching code. NOT for: directly implementing code (use the default agent); answering quick one-off questions."
argument-hint: "Describe the story, feature, or change to plan"
---

# Generate Implementation Plan

## When to Use

- User says "plan this", "before we start", "let's design", "create a plan for", or "what's the approach"
- User shares a story, GitHub issue, or acceptance criteria and asks for implementation guidance
- The change touches infrastructure, migrations, multi-env rollout, or has irreversible steps
- You need to surface risks, ordering constraints, or external dependencies before writing code

## Procedure

### 1. Understand the codebase

Before asking questions, gather enough context to ask _good_ questions:

- Search for the relevant modules, files, and conventions (`file_search`, `grep_search`, `semantic_search`)
- Read the key files in full — don't rely on summaries
- Check existing tests, schemas, and integration points
- Look for related patterns already established in the project

Use the `Explore` subagent for broad, thorough exploration when the change touches many files.

### 2. Consult available knowledge sources

Use all available context sources:

- **MCP tools** — if `aws-knowledge-mcp` or similar is online, query it for official best-practice guidance before making architectural decisions
- **Fetch docs** — use `fetch_webpage` when a specific reference URL is known
- **AGENTS.md** — re-read project conventions (`authorizeClient`, error types, test coverage rules, etc.)

### 3. Ask clarifying questions

Use `vscode_askQuestions` to surface decisions that materially shape the plan. Only ask questions where the answer changes the approach. Good question topics:

- Irreversible or risky steps (e.g. prod EIP changes, Pay.gov allowlisting dependencies)
- Scope boundaries ("does this story include X or is that a separate ticket?")
- Environment rollout order and gating conditions
- Back-compat requirements

Keep questions minimal — batch them into one `vscode_askQuestions` call.

### 4. Produce the plan

Write the plan directly in the chat response. Structure it as:

```
## Plan: <short title>

### Overview
One paragraph: what the change does and why.

### Phases
Numbered phases, each with:
- Title
- Files affected (linkified)
- What changes and why
- Any `moved` blocks, migrations, or ordering constraints

### Verification
- How to validate each phase (terraform plan, test run, manual check)
- What "no destroy" looks like in plan output
- Rollback path if applicable

### Open decisions / follow-ups
- Items gated on external parties (allowlisting, approvals)
- Deferred scope clearly labeled
```

Use linkified file references (`[path/file.tf](path/file.tf#L10)`). Never use backtick filenames.

### 5. Confirm before implementing

End the plan with: "Want me to adjust anything, or shall I start implementation?"

Do NOT begin writing code until the user confirms. The purpose of this skill is planning, not implementation.

## Key rules

- Surface the riskiest item first (data loss, irreversible infra changes, external dependencies)
- `moved` blocks are mandatory whenever Terraform resources are renamed/re-keyed — call this out explicitly
- For multi-env changes (dev/stg/prod), always state the apply order and any gating conditions between environments
- Flag Pay.gov or external-system dependencies (IP allowlisting, certificate requirements, SOAP contract changes) as explicit blockers
- If a prod resource uses `prevent_destroy = true`, state clearly what the `moved` block strategy is before any plan touches it
