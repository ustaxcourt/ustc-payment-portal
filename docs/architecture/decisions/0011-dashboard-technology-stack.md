# 11. Technology stack for the Case Services & Finance dashboards

Date: 2026-07-24

## Status

Proposed

> This ADR is **Proposed**, not yet Accepted. It records the recommendation from
> the dashboard technology spike
> ([`../proposals/dashboard-technology-stack.md`](../proposals/dashboard-technology-stack.md))
> so the team has a concrete decision to ratify. On ratification, change Status to
> **Accepted** with the date, and only then seed the `ustc-payment-portal-dashboard`
> repo's `main`. This ADR lives here for now because the dashboard repo is empty;
> it should be copied to that repo (as its `0001`) once the repo is seeded.

## Context

We are building companion dashboards for the payment portal's administrative
users — Case Services and Finance (epic PAY-268) — as separate front-end
applications in a new repo, `ustc-payment-portal-dashboard`. They read data from
this backend and present it to a small, authenticated group of Court users.

The stack must accomplish:

1. **Single sign-on with Microsoft Entra ID** — sign in once with a Court login;
   non-authenticated users cannot view any dashboard page; access restricted to a
   **subset** of users later (not the whole tenant).
2. A **data table** with **sortable headers**, **filtering**, and **timeframe
   (date-range) querying**.
3. **Export** to CSV or similar.
4. **The hard requirement:** the table's timeframe, filtering, sorting, pagination,
   and export must work **together, at all times, seamlessly** — combining and
   staying coherent on every interaction. This coordination is the central
   engineering challenge; the stack must make it structurally hard to get wrong.

Signals shaping the decision:

- **A proven house stack already exists for this exact problem.** USTC has shipped
  two internally-authenticated dashboards — `ustc-zendesk-dashboard` and
  `library-koha-uploader` — on **Next.js + React + next-auth + Tailwind + AWS**,
  with Entra ID SSO. The riskiest requirement (SSO against a Microsoft tenant we
  do not control) is therefore already retired in our org, and a USTC dev
  (James deVos) has done the Entra app-registration setup before.
- **We are an AWS + TypeScript shop.** Backend is TS/Node on Lambda + Postgres;
  keeping the dashboard in our own AWS account is the simpler compliance story for
  a Court application.

The team compared this house-stack approach (Option A) against a client-only SPA
with a batteries-included grid (Option B) and other full-stack frameworks
(Option C). Full analysis in the spike proposal.

## Decision

The team adopts **Option A** — the Next.js house stack — for the Case Services &
Finance dashboards:

| Concern | Choice |
| --- | --- |
| Framework | **Next.js (App Router) + TypeScript** |
| SSO / logout | **next-auth v4, Microsoft Entra ID provider** |
| Route protection | **Next.js middleware** (server-side) |
| Access restriction | Entra **app roles / group claims**, checked in the session callback |
| Table logic | **TanStack Table** (headless) |
| Data fetching / caching | **TanStack Query** |
| Query state | **URL search params** (via `nuqs` or native) as the single source of truth |
| Filter / sort / paginate / export | **server-side** against Postgres/Knex |
| Components / styling | **shadcn/ui + Tailwind** |
| Hosting | Our AWS account, **Terraform-managed per-environment** — **AWS Amplify** or **OpenNext** (open question) |

The core architectural commitment is **URL-as-single-source-of-truth with
server-side data processing**: timeframe, filters, sort, and page all serialize
into one URL, which drives one API request, which the backend resolves with
`WHERE`/`ORDER BY`/`LIMIT`. This is what makes requirement #4 a property of the
architecture rather than per-interaction wiring.

### Alternatives considered

**Option B — Vite + React SPA + AG Grid, static-hosted on S3/CloudFront.**
Batteries-included: sorting, filtering, and CSV export nearly for free.
Rejected because (1) route protection would be client-side only — weaker against
the explicit "cannot view" requirement; (2) it re-implements Entra SSO in a SPA
(MSAL) instead of reusing our proven next-auth pattern, re-taking on the exact risk
Option A avoids; (3) the features we would actually want (server-side row model,
advanced filters) are AG Grid **Enterprise** (paid per-developer licensing) — a
procurement headache — and theming it to match Figma is heavier than headless
components.

**Option C — Remix / React Router 7, or SvelteKit.**
Capable modern frameworks, but no incremental benefit over Option A for this team
and a real cost: **zero prior art in our org**, so we would be first to solve Entra
SSO on that framework here. A spike is the wrong place to also adopt a new
framework.

## Consequences

- **The biggest risk is retired before we write a line.** SSO reuses a pattern
  shipped twice in our org, with institutional support (James deVos). We avoid
  re-solving auth against a tenant we do not control.
- **The "cannot view" requirement is satisfied structurally.** Next.js middleware
  refuses to render protected routes server-side, rather than merely hiding pages
  in the browser as a SPA would.
- **The "everything works together" requirement is guaranteed by design.** One
  URL-derived object drives one request; timeframe/filter/sort/page cannot fall
  out of sync because there is nothing to sync between. This is the primary reason
  for the choice.
- **It scales with Court data that only grows.** The database sorts/filters/pages;
  the browser receives only the visible page (~50 rows). "Fetch everything and sort
  in JavaScript" is explicitly avoided.
- **CSV export is trivial and provably correct.** Export is the same query minus
  the row limit, streamed as `text/csv`; it matches exactly what the user is
  filtered to, and never loads a large blob into browser memory.
- **Shareable, bookmarkable, auditable views come free** from URL-as-state — high
  value for finance/audit workflows; back/forward and refresh "just work."
- **Full design control at zero licensing cost.** Headless TanStack + shadcn +
  Tailwind means the Figma design is the markup, with no per-seat grid license.
- **We take on a little more glue code** than a drop-in grid. Accepted trade for
  design control, $0 licensing, and URL-state benefits; justified specifically by
  this dashboard's finance scale, coordination requirement, and shareable-view
  value (it would be over-engineering for a tiny static table).
- **Cross-account hosting is per-environment, managed in Terraform — not shared
  apps.** All three environments are separate AWS accounts (dev `723609007960`,
  stg `747103385969`, prod `802939326821`). An Amplify app is account-bound, so
  there is no sharing across environments — each environment gets its own app in
  its own account. Resolution: define the Amplify app itself in Terraform
  (`aws_amplify_app` / `aws_amplify_branch` / `aws_amplify_domain_association`) and
  apply it **per-environment with that account's OIDC role, exactly as Payment
  Portal deploys today** (each `environments/{dev,stg,prod}` root against its own
  account). This makes Amplify's cross-account story identical to OpenNext's and to
  the existing backend; the "branch-per-env in one app" model is **not** used.
  Remaining Amplify-specific differences (not cross-account): a GitHub source
  connection must be authorized in each account, and builds run in Amplify's
  managed CI rather than our GitHub Actions pipeline.

### Open questions to resolve alongside ratification

1. **Table API contract** — agree the query-param shape now
   (`from`, `to`, `filter[...]`, `sort`, `page`, `pageSize`); every downstream
   ticket and backend endpoint depends on it.
2. **Entra app registration** — schedule setup with James deVos; ensure the app
   emits **group/role claims** from day one, even before we enforce them.
3. **Hosting** — Amplify vs OpenNext, **both defined in Terraform and applied
   per-environment/per-account like Payment Portal** (so cross-account is a
   non-issue either way). The real difference is managed build (Amplify's CI +
   a per-account GitHub connection) vs building in our GitHub Actions pipeline and
   deploying artifacts (OpenNext). Default to whatever `ustc-zendesk-dashboard`
   already uses.
4. **next-auth v4 vs Auth.js v5** — default to v4 to match what already works.
5. **Repo scaffolding ownership** — which ticket seeds the dashboard repo's `main`.

## References
- Epic PAY-268 (Figma designs linked on the epic)
- TanStack Table — https://tanstack.com/table
- TanStack Query — https://tanstack.com/query
- shadcn/ui — https://ui.shadcn.com
- next-auth Microsoft Entra ID provider — https://next-auth.js.org
