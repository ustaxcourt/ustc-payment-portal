# PAY-313: Add Payment Portal as a Dev Dependency (POC) Implementation Plan

## Story Alignment

This plan supports PAY-313.

Title: POC: Add the Payment Portal as a Dev Dependency to another package, and get it to run along with the Test Server.

Goals covered by this plan:

- Make the Payment Portal runnable from a consumer project as an npm-installed package.
- Ensure one command starts both the Portal and the Pay.gov Test Server for local development.
- Publish clear, safe developer documentation for pre-publish and post-publish usage.
- Validate the end-to-end setup with a DAWSON developer walkthrough (Anurag).

## Current State Snapshot (from this repo)

- The Portal already has local orchestration via `npm run start:all`.
- The local stack script starts docker services, the Portal dev server, and the Pay.gov Test Server process.
- The package is publishable to npm under `@ustaxcourt/payment-portal`.
- Developer docs now include a dedicated local package testing guide.

## Implementation Status Update (May 26, 2026)

Completed in this repo:

- Added package CLI entrypoint via `bin/payment-portal.js` and npm `bin` mapping.
- CLI now launches `npm run start:all` from the installed package root.
- CLI loads `.env` from the consumer project's current working directory.
- Expanded published package contents (`files`) to include runtime startup assets (for example `scripts`, `db`, `src`, `docker-compose.yml`, `knexfile.ts`, `tsconfig.json`).
- Moved runtime-required dependencies used by startup flow into `dependencies`.
- Updated docker db-init command to handle both lockfile-present (`npm ci`) and lockfile-absent (`npm install`) packaged contexts.
- Added docs for safe consumer-package testing: `docs/testing-package-locally.md`.
- Linked new guide from `README.md` publishing section.
- Updated `start:dev-server` to run compiled JS (`node dist/devServer.js`) instead of compiling TS with `ts-node` at consumer runtime.

Still pending to close PAY-313:

- Full DAWSON (ef-cms) POC validation on latest tarball/package version.
- Anurag walkthrough and sign-off notes.
- Any follow-up fixes discovered during walkthrough (Portal and/or Pay.gov Test Server).

## Scope

In scope:

- Package execution path for `npx @ustaxcourt/payment-portal`.
- Packaging/runtime compatibility for consumer-project execution.
- Documentation for adding/configuring as a dev dependency and running with one command.
- Verification with DAWSON developer walkthrough.

Out of scope:

- Production deployment changes.
- Non-local hosted test environments.
- Broader SDK/API contract redesign.

## Implementation Plan

### Phase 1: Package Runtime Readiness

1. Ensure npm package exposes a CLI entrypoint:
   - Add a `bin` command for `@ustaxcourt/payment-portal`.
   - Route the CLI to the same behavior as `npm run start:all`.
2. Ensure required runtime assets are packaged:
   - Include scripts/config/runtime source files needed by local startup.
   - Include database migration/seed artifacts required by db-init.
3. Ensure runtime dependencies are available to consumers:
   - Move runtime-required modules from `devDependencies` to `dependencies`.
4. Make db-init resilient in packaged installs:
   - Support lockfile-present and lockfile-absent paths for dependency install in docker init.

Deliverable:

- Consumer project can run `npx @ustaxcourt/payment-portal` and reach the same startup path as local `start:all`.

### Phase 2: Documentation and Developer Experience

1. Create a dedicated guide for testing/consuming as a package:
   - Recommended path: tarball flow via `npm pack` for publish-like validation.
   - Optional path: `npm link` for fast local iteration.
   - Required `.env` guidance and safety caveats.
2. Add discoverability from top-level docs:
   - Link the guide from README in the publishing section.
3. Include official npm references for standard commands:
   - `npm pack`, `npx`, `npm link`, and `npm install` tarball/local-path docs.

Deliverable:

- Clear, step-by-step docs that DAWSON developers can follow without repo tribal knowledge.

### Phase 3: Consumer POC in DAWSON (ef-cms)

1. In DAWSON repo, add Payment Portal as a dev dependency:
   - Preferred POC method: install a tarball from current Portal branch.
   - Alternate method after publish: install version from npm registry.
2. Configure DAWSON local `.env` values for Portal/Test Server startup.
3. Run the single command from DAWSON project root:
   - `npx @ustaxcourt/payment-portal`
4. Confirm local behavior:
   - Portal API is reachable.
   - Pay.gov Test Server is running.
   - Docker-backed db-init completes.

Deliverable:

- Verified DAWSON-local POC demonstrating one-command startup from consumer context.

### Phase 4: Validation and Sign-off

1. Conduct live walkthrough with Anurag using only the documentation.
2. Capture any gaps, ambiguities, or missing prerequisites.
3. Apply fixes in Portal repo and/or Pay.gov Test Server repo as needed.
4. Re-run walkthrough until no undocumented/manual steps are required.

Deliverable:

- Walkthrough confirmation that docs work as written.

## Acceptance Criteria Mapping

1. Documentation exists to add and configure the Portal as a dev dependency along with a single command to run locally:
   - Satisfied by Phase 2 deliverables and validated in Phase 3.
2. Anurag has walked through the documentation to verify behavior:
   - Satisfied by Phase 4 walkthrough and sign-off notes.
3. Any changes required to make this happen are introduced to Portal or Pay.gov Test Server codebases:
   - Satisfied by Phase 1 (Portal) and any follow-up cross-repo fixes from Phase 4.

## Work Breakdown and Suggested Ownership

- Portal packaging and CLI wiring: Payment Portal team.
- Documentation authoring and README integration: Payment Portal team.
- DAWSON consumer POC execution: DAWSON + Payment Portal pairing.
- Cross-repo fixes in Pay.gov Test Server (if discovered): Test Server maintainers with Portal support.

## Risks and Mitigations

- Risk: Node/npm engine mismatch in consumer repo blocks install.
  - Mitigation: Document required engine versions and include quick verification commands.
- Risk: Local port conflicts prevent startup.
  - Mitigation: Document required ports and override options.
- Risk: Missing env vars in consumer project.
  - Mitigation: Provide minimum required `.env` template and troubleshooting section.
- Risk: Tarball test diverges from eventual published artifact.
  - Mitigation: Validate with `npm pack --dry-run` and perform one post-publish smoke check.

## Verification Checklist

- `npm pack --dry-run` shows CLI/bin and required runtime files.
- Consumer install from tarball succeeds.
- `npx @ustaxcourt/payment-portal` starts docker + Portal + Pay.gov Test Server.
- Basic health/API check succeeds (for example `/` and `/docs`).
- Walkthrough completed by Anurag with no undocumented steps.

Additional checks from implementation:

- Consumer startup does not require compiling TS in consumer repo (`start:dev-server` uses `dist/devServer.js`).
- Packaged startup works when `package-lock.json` is not included in the published artifact.

## Exit Criteria

PAY-313 is complete when all are true:

- Documentation is published in this repo and linked from primary onboarding docs.
- DAWSON POC run succeeds using the documented one-command flow.
- Anurag walkthrough is completed and recorded.
- Any required code changes in Portal/Test Server are merged.
