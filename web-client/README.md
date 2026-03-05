# 🚀 USTC Payment Portal — Developer Guide

Welcome to the Payment Portal web client.
This document explains the project structure, conventions, and how to build new features in a consistent, maintainable way.

We keep our stack intentionally **simple**:

*   **React + TypeScript + Vite**
*   **Local feature-based folder organization**
*   **Composable reusable hooks (`useFetch`, `useGet`, `usePost`, etc.)**
*   **Lightweight services using `fetch` (no Axios)**
*   **Co-located mocks + feature APIs**
*   **Clear rules for components, hooks, pages, and layouts**

This README is your **DX rulebook**.
Follow it → everything stays clean.

***

# 📁 Project Structure

    src/
      assets/                 # Static assets (SVG, images)
      components/             # Truly shared UI components (used across features)
      lib/
        hooks/                # Generic reusable hooks (useFetch, useGet, usePost)
        utils/                # Helpers not tied to any feature
      features/
        <feature-name>/
          components/         # UI parts specific to this feature
          api/                # Fetch/service functions returning domain types
          hooks/              # Feature-specific hooks composed from generic hooks
          mock.ts             # Mocks used during development/testing
          types.ts            # Domain types for this feature only
          pages/              # Pages responsible for rendering this feature
      pages/                  # App-level pages (router-level)
      layouts/                # Site-wide layouts
      theme.ts                # MUI theme overrides
      App.tsx                 # App shell
      main.tsx                # Vite/React entry

### Why feature‑first organization?

Because each feature is self-contained:

*   UI
*   API calls
*   mocks
*   hooks
*   types

Everything lives together → easier onboarding, easier refactoring, easier testing.

***

# 📦 Creating a New Feature

Here is the required structure:

    src/features/<feature-name>/
      types.ts
      mock.ts
      api/
        index.ts
      components/
        <Feature>Widget.tsx
        <Feature>Table.tsx
      hooks/
        use<Feature>.ts
      pages/
        <Feature>Page.tsx

### Example: a new `users` feature

    src/features/users/
      types.ts                ≈ User, UserRole, etc.
      mock.ts                 ≈ mockUsers
      api/
        index.ts              ≈ fetchUsers, fetchUserById
      components/
        UsersTable.tsx
        UserProfileCard.tsx
      hooks/
        useUsers.ts
      pages/
        UsersPage.tsx

### Template you can copy/paste

**types.ts**

```ts
export type User = {
  id: string
  name: string
  email: string
  createdAt: string
}
```

**mock.ts**

```ts
export const mockUsers: User[] = [...]
```

**api/index.ts**

```ts
import { mockUsers } from '../mock'

export async function fetchUsers(signal?: AbortSignal) {
  await new Promise(r => setTimeout(r, 250))
  return mockUsers
}
```

**hooks/useUsers.ts**

```ts
import { useFetch } from '../../../lib/hooks/useFetch'
import { fetchUsers } from '../api'

export function useUsers() {
  return useFetch(() => fetchUsers(), [])
}
```

**components/UsersTable.tsx**

```ts
export function UsersTable({ rows }) { ... }
```

**pages/UsersPage.tsx**

```tsx
export default function UsersPage() {
  const { data, loading, error } = useUsers()
  return <UsersTable rows={data ?? []} loading={loading} />
}
```

***

# 🔁 Reusing Shared Libraries

We keep reusable building blocks in **`src/lib`**.

## Shared hooks — `src/lib/hooks`

These are generic utilities not tied to any feature.

### `useFetch(fetcher, deps)`

A universal async hook:

*   `fetcher(signal) → Promise<T>`
*   Automatically manages `loading`, `error`, `data`
*   Supports cancellation via `AbortController`

```ts
const { data, loading, error, refetch } = useFetch(
  (signal) => fetch('/api/users', { signal }).then(r => r.json()),
  [id]
)
```

### `useGet(url, deps)` & `usePost(url, body, deps)`

Light wrappers around native fetch + `useFetch`.

    src/lib/hooks/
      useFetch.ts
      http.ts                # useGet(), usePost()

***

# 🧩 Components — Rules & Conventions

### 1) Shared UI components → `src/components/`

Use this **only** if:

*   It can be used across multiple features.
*   It has no feature-specific logic.

Examples:

    src/components/Button.tsx
    src/components/Modal.tsx
    src/components/DataEmptyState.tsx

### 2) Feature components → `src/features/<feature>/components/`

These belong **only** to a single feature.

Examples (Transactions):

    TransactionsTable.tsx
    GridSortIconCircle.tsx
    StatusTabs.tsx

Rules:

*   No fetching inside components.
*   Get all data via props.
*   Keep them pure/presentational.

***

# 🧠 Hooks — Rules & Conventions

### 1) Shared hooks → `src/lib/hooks/`

*   Reusable across the entire application.
*   No domain/types from features.
*   Should handle generic behaviors (fetching, debouncing, intervals, etc.)

### 2) Feature hooks → `src/features/<feature>/hooks/`

Naming rule:

    use<Feature><Action>.ts

Example:

    useTransactionsByStatus.ts
    useUsers.ts
    useInvoices.ts

They should:

*   Wrap `useFetch`, `useGet`, `usePost`, or any lower-level hook.
*   Encode domain rules or transform data.
*   Never contain UI logic.

***

# 📄 Pages — Rules & Conventions

Pages live either in:

**App-level pages:**

    src/pages/

**Feature-level pages:**

    src/features/<feature>/pages/

Pages:

*   Own route-level responsibilities.
*   Compose hooks + components.
*   Pass props downward.
*   Should NOT contain business logic or transformations.

Example:

```tsx
export default function TransactionsStatusPage({ status }) {
  const { data, loading, error } = useTransactionsByStatus(status)

  return (
    <TransactionsTable
      rows={data ?? []}
      loading={loading}
      error={error}
      status={status}
    />
  )
}
```

***

# 🧱 Layouts — Rules & Patterns

Layouts define the surrounding structure around pages.

Their home:

    src/layouts/

Purpose:

*   Navigation bars
*   Sidebars
*   Shared headers/footers
*   Consistent spacing & containers

Never put business logic here.

***

# 🔌 API / Services — Rules

API functions live in:

    src/features/<feature>/api/

Rules:

*   One file per feature (`index.ts`).
*   Keep them thin.
*   Accept parameters & `signal` if applicable.
*   Return typed domain models (e.g., `Transaction[]`).
*   Do **not** use `fetch` in components — always via service.

Example:

```ts
export async function fetchTransactionsByStatus(status, { signal }) {
  const url = `/transactions?status=${status}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('Failed to load')
  return res.json() as Promise<Transaction[]>
}
```

***

# 🎭 Mocks — Rules

Mocks live **beside** their feature:

    src/features/<feature>/mock.ts

Rules:

*   Must follow the same type as real API.
*   Should mimic API latency.
*   Should be deterministic for UI dev & tests.
*   You can toggle mock API usage in services using an env flag like:

```ts
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
```

***

# 🛠 ESLint & React Compiler

(Your original README content can stay; shortened here.)

*   Vite + React Compiler enabled.
*   ESLint recommended + TypeScript rules.
*   Can switch to type-aware ESLint for production.
