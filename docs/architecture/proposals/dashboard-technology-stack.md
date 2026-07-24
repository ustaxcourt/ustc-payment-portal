# Spike: Technology for the Case Services & Finance Dashboards

> **Type:** Spike / options analysis — _not_ a decision. This document exists to
> give the team the information needed to choose. Once we choose, we record the
> outcome as an ADR in [`docs/architecture/decisions/`](../decisions/) and _then_
> seed the dashboard repo's `main`.
>
> **Ticket:** PAY-\<spike#\> (rename this file to `PAY-<spike#>-dashboard-technology-stack.md`)
> **Epic:** PAY-268 — Dashboards for Payment Portal
> **Related:** Single-Sign-On to Dashboard
> **Author:** Anthony Loera
> **Date:** 2026-07-24
> **Status:** Draft for team review

## Problem

We are building companion dashboards for the payment portal's administrative
users — Case Services and Finance. They are separate front-end applications
(new repo: `ustc-payment-portal-dashboard`) that read data from this backend and
present it to a small, authenticated group of Court users.

This spike decides the technology stack. It does **not** build the app.

## What the technology has to accomplish

Pulled from the epic's component stories and the Figma designs:

1. **Single sign-on with Microsoft Entra ID** — users sign in once with their
   Court login and land in the dashboard. Non-authenticated users cannot view
   any dashboard page. We must be able to restrict access to a **subset** of
   users later (not everyone in the tenant).
2. **A data table** of payment/transaction records with **sortable column
   headers**.
3. **Filtering** on the table.
4. **Timeframe querying** (date-range) on the table.
5. **Export** — CSV or similar.
6. **The hard requirement:** #2–#5 must work **together, at all times,
   seamlessly.** Timeframe + filtering must combine; sorting must respect the
   active filters; export must match exactly what's on screen. This coherence is
   the central engineering challenge, and the stack must make it easy to get
   right rather than something we hand-wire per interaction.

## Constraints and signals that shape the decision

- **We already have a proven house stack for this exact problem.** USTC has
  shipped **two** internally-authenticated dashboards on the same recipe —
  `ustc-zendesk-dashboard` and `library-koha-uploader` — using
  **Next.js + React + next-auth + Tailwind + AWS SDK + Sentry**, with Entra ID
  SSO. A USTC dev (James deVos) has done the Entra app-registration setup before.
  The single riskiest requirement in this epic (SSO against a Microsoft tenant we
  don't control) is therefore **already retired** in our org.
- **We are an AWS shop.** Backend is TypeScript/Node on Lambda + Postgres. Keeping
  the dashboard in our own AWS account (rather than a third-party host) is the
  simpler compliance story for a Court application.
- **TypeScript everywhere.** The backend, and both existing dashboards, are TS.
  A TS front end shares language, types, and mental model with this repo.

## Options considered

### Option A — Next.js (App Router) + house stack _(recommended)_

Reuse the pattern already shipped twice in our org.

| Concern | Choice |
| --- | --- |
| Framework | **Next.js 15 (App Router) + TypeScript** |
| SSO / logout | **next-auth v4, Microsoft Entra ID provider** |
| Route protection | **Next.js middleware** (server-side) |
| Table logic | **TanStack Table** (headless) |
| Data fetching/caching | **TanStack Query** |
| Query state | **URL search params** (via `nuqs` or native) |
| Filter/sort/paginate/export | **server-side** against Postgres/Knex |
| Components / styling | **shadcn/ui + Tailwind** |
| Hosting | **AWS Amplify Hosting** _or_ **OpenNext + Terraform** (our AWS account) |

**Why this option:**

- **Retires the biggest risk for free.** SSO is the scary part, and we have a
  working reference implementation plus institutional knowledge. A different
  framework means re-solving Entra SSO from scratch, on a deadline.
- **Server-side route protection.** The AC "non-authenticated users cannot view
  the pages" is satisfied structurally by Next.js middleware, which refuses to
  render protected routes server-side. A pure client-side SPA can only _hide_
  pages in the browser.
- **The table subsystem is exactly what the ACs need** (detailed below).
- **Language and skills continuity** with the backend and the two existing
  dashboards — same TypeScript, same auth pattern, same styling.

**Tradeoff:** headless table + your own components means slightly more glue code
than a batteries-included grid. We pay a little boilerplate to buy full design
control and zero licensing cost. For a bespoke-designed dashboard, that's the
right trade.

### Option B — Vite + React SPA + AG Grid, static-hosted on S3/CloudFront

A client-only single-page app with a batteries-included data grid.

**Why someone might pick it:** AG Grid Community gives sorting, filtering, and CSV
export nearly for free with minimal table code, and a static SPA is trivial to
host on S3/CloudFront.

**Why we're not recommending it:**

- **Route protection is client-side only** — weaker against the explicit "cannot
  view" AC. The browser downloads the app and _then_ decides whether to show it.
- **We'd re-implement Entra SSO in a SPA** (MSAL redirect flow) instead of reusing
  our proven next-auth pattern — re-taking on the exact risk Option A avoids.
- **The slick AG Grid features cost money** — server-side row model and some
  filters are AG Grid **Enterprise** (paid, per-developer licensing), which is a
  procurement headache for a gov project. Styling it to match Figma is also
  heavier than headless + our own components.

It trades away our two biggest de-risking advantages (proven SSO, server-side
protection) to save table boilerplate that Option A handles fine.

### Option C — Remix / React Router 7, or SvelteKit

Capable, modern full-stack frameworks with good data-loading stories.

**Why we're not recommending them:** no incremental benefit over Option A for
_this_ team, and a real cost: **zero prior art in our org**, so we'd be the first
to solve Entra SSO on that framework here. A spike is the wrong place to also
adopt a brand-new framework. Worth revisiting only if a future need clearly
exceeds what Next.js offers.

## Deep dive: the table subsystem (the real engineering)

This is where AC #6 — "everything works together, seamlessly" — is won or lost.
The decision that makes or breaks it is **where the query state lives** and **where
the data is processed**.

### Three complementary layers (they do _not_ overlap)

- **TanStack Table — logic, not looks.** Headless: it manages sort state, filter
  state, pagination, and column definitions but renders **no markup**. A brain
  with no face.
- **TanStack Query — data, not looks.** Fetches and caches server data; handles
  loading/error/empty states, deduplication, background refetch, and request
  cancellation (kills stale in-flight requests so a slow old response can't
  overwrite the current view).
- **shadcn/ui + Tailwind — looks, not logic.** The actual styled cells, dropdowns,
  date-range picker, and buttons. This is what we render TanStack's state _into_.

TanStack is deliberately headless **so that** we can style it however Figma
dictates — and shadcn + Tailwind is what we style it with. Different jobs, same
screen.

### The key move: the URL is the single source of truth

All query state — timeframe, active filters, sort column, page — serializes into
**one** URL:

```
/transactions?from=2026-04-01&to=2026-06-30&status=disputed&sort=amount:desc&page=1
```

Every user interaction does the same thing: **change the URL.** Everything
downstream reacts to it in one path:

```
User interaction (click header / pick filter / change date range / next page)
        │
        ▼
URL changes  ────────►  one params object  { from, to, status, sort, page }
        │
        ▼
TanStack Query  ──►  calls backend API  ──►  Postgres: WHERE / ORDER BY / LIMIT
        │                                          │
        │◄──────────────── page of rows ──────────-┘
        ▼
TanStack Table  (arranges rows + sort/filter/page state)
        │
        ▼
shadcn/ui + Tailwind  (renders the styled table)
        │
        ▼
    User sees it
```

**Why this structurally guarantees AC #6:** there is only **one** state object
(read from the URL) driving **one** request. Timeframe, filter, and sort cannot
fall out of sync because there is nothing to sync _against_ — they're fields of
the same object. "Everything works together" becomes a property of the
architecture, not something we manually maintain per interaction.

Bonus benefits that fall out of URL-as-state:

- **Shareable, bookmarkable, auditable views.** "Disputed transactions, Q2, sorted
  by amount" _is_ a URL a Finance user can paste into a ticket or email; a
  colleague opens the identical screen. High value for a Court finance/audit team.
- **Back/forward and refresh just work** — including returning to the exact view
  after a session timeout → re-login, because state lived in the address bar, not
  in memory.
- **Deep-linking** into a pre-filtered view from an alert or another tool is just
  constructing a URL.

### Process on the server, not in the browser

Because the query state is already clean params, we send them to the backend
instead of processing in the browser:

- **Scales with the data.** "Fetch all rows and sort in JS" is fine at 500 rows
  and falls over at 500,000. Finance/transaction data grows unbounded. Postgres +
  Knex already does `WHERE`/`ORDER BY`/`LIMIT` fast; ship the browser only the ~50
  rows it displays.
- **CSV export is nearly free and always correct.** Export is the _same query_ the
  table is running, minus the `LIMIT`, streamed as `text/csv`. It therefore
  **exactly matches** what the user is filtered to (an auditing/trust property that
  matters for financial data), and there's **no giant client-side blob** — the
  server streams it, so a large export never freezes the tab.
- **Security posture.** The browser only ever holds the page it's authorized to
  see; the full dataset never sits in client memory.

## Authentication & SSO approach (Option A)

- **next-auth v4 with the Microsoft Entra ID provider** — the same pattern shipped
  in `library-koha-uploader`.
- **Server-side gate via `middleware.ts`** — satisfies "non-authenticated users
  cannot view the pages."
- **Restrict to a subset of users** via Entra **app roles / group claims**,
  checked in the next-auth session/token callback. **Plan the app registration to
  emit group claims from day one**, even if we allow everyone initially — this is
  painful to retrofit.
- Logout clears the session and redirects to the Entra sign-out endpoint.

## Hosting (Option A)

Keep it in our AWS account for the simplest compliance story:

- **AWS Amplify Hosting** — first-class Next.js SSR support, fastest path, minimal
  infra to own.
- **OpenNext + Terraform** — deploys Next.js onto Lambda/CloudFront in our account;
  more control, more infra, and we already have Terraform muscle in this repo.

Recommendation: confirm how `ustc-zendesk-dashboard` / `library-koha-uploader` are
deployed today and match it.

## Recommendation

Adopt **Option A**: **Next.js (App Router) + TypeScript + next-auth (Entra ID) +
TanStack Table + TanStack Query + URL-as-state + server-side query processing +
shadcn/ui + Tailwind**, hosted in our AWS account.

It reuses a pattern proven twice in our org, retires the SSO risk, satisfies the
"cannot view" AC structurally, and gives the table subsystem an architecture where
"everything works together" is guaranteed by design rather than by careful wiring.

## Open questions for the team (decide before we ratify)

1. **Table API contract.** Agree the query-param shape now
   (`from`, `to`, `filter[...]`, `sort`, `page`, `pageSize`) — every downstream
   table/filter/timeframe/export ticket and the backend endpoints depend on it.
2. **Entra app registration.** Schedule the setup with James deVos; ensure the app
   emits **group/role claims** even before we enforce them.
3. **Hosting.** Amplify vs OpenNext + Terraform — match the existing dashboards?
4. **next-auth v4 vs Auth.js v5.** Default to v4 to match what already works; only
   consider v5 deliberately, not during this spike.
5. **Repo scaffolding ownership.** Which ticket seeds `ustc-payment-portal-dashboard`
   `main` once the decision is ratified?

## Next steps

1. Review this doc with the team (Case Services + Finance stakeholders + Dev).
2. Ratify a decision.
3. Record it as an **ADR** in [`docs/architecture/decisions/`](../decisions/).
4. Only then: seed `ustc-payment-portal-dashboard` `main` with the scaffold under
   its own ticket.

## References

- Existing house-stack dashboards: `ustaxcourt/ustc-zendesk-dashboard`,
  `ustaxcourt/library-koha-uploader`
- Epic PAY-268 (Figma designs linked on the epic)
- TanStack Table — https://tanstack.com/table
- TanStack Query — https://tanstack.com/query
- shadcn/ui — https://ui.shadcn.com
- next-auth Microsoft Entra ID provider — https://next-auth.js.org
