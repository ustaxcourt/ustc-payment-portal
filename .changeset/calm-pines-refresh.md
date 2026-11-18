---
"@ustaxcourt/payment-portal": patch
---

PAY-508: dependency updates for the week of 2026-11-16.

- Pin `.nvmrc` to Node 24.22.3, the November Node.js security release.
  `engines.node` stays `>=24.20.0 <25.0.0`, so consumers aren't required to
  upgrade Node.
- Refresh the lock file's in-range updates, including `@aws-sdk/*` 3.1171.0,
  `@smithy/core` 3.41.0, `fast-xml-parser` 5.12.1 and `swagger-ui-dist` 5.35.0.
  `@biomejs/biome` 2.6.8 and `@playwright/test` 1.65.1 are dev-only.
- Add an `allowScripts` policy to `package.json` so npm install scripts are
  explicit: `esbuild` and `@scarf/scarf` are allowed; `@parcel/watcher`,
  `@playwright/browser-chromium`, `protobufjs`, `unix-dgram` and `fsevents` are
  blocked. No install script is needed in CI or at runtime for the blocked
  packages.
