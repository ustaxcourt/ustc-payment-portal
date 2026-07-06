# PAY-286 Script Testing By Exported Functions

## Purpose

Several files under `scripts/` currently combine helper logic, orchestration logic, logging, and `process.exit(...)` behavior in the same module and then execute that logic at module load.

That pattern makes tests brittle because the test has to `require()` the file to trigger behavior, then assert on side effects after the fact. The result is script-level tests that are tightly coupled to module initialization instead of function behavior.

The better pattern is to export the functions that contain the real behavior and test those functions directly. Keep CLI-only behavior in a minimal entrypoint block.

## Files That Follow This Pattern

Representative examples in this repo include:

- `scripts/check-local-flow.js`
- `scripts/ensure-test-db.js`
- `scripts/start-local-stack.js`
- `scripts/start-pay-gov-test-server.js`

These files are not all identical, but they share the same testing problem:

- helper logic and orchestration live in the same file
- module load triggers real behavior
- tests rely on `require()` side effects
- process exit and logging become the main observable behavior

## Recommendation

### Prefer exported functions over require-time execution in tests

Tests should call exported functions directly instead of importing a file only to make its top-level code run.

What to export depends on the script, but the rule is simple:

- export the function that contains the useful logic
- export pure helpers when they contain meaningful branching or parsing
- keep `process.exit(...)` and CLI wiring in a thin wrapper only

## Target Structure

Preferred structure for a script module:

```js
function parseSomething(input) {
  // helper logic
}

async function runMain() {
  // orchestration logic
}

module.exports = {
  parseSomething,
  runMain,
};

if (require.main === module) {
  runMain().catch((error) => {
    log.error('Failed:', error);
    process.exit(1);
  });
}
```

This gives us two clean test surfaces:

- function-level tests for parsing, validation, branching, and orchestration
- at most one narrow entrypoint test for CLI behavior

## What To Avoid

Avoid this pattern in new or refactored tests:

```js
require('./some-script');
await flushPromises();
expect(process.exit).toHaveBeenCalledWith(1);
```

That style is acceptable only for one narrow entrypoint test when the purpose is specifically to verify CLI startup behavior.

It should not be the primary way we test logic.

## What To Test Directly

### Helper functions

If the script contains parsing or validation helpers, export them and test them directly.

Examples:

- parse response bodies
- validate success/failure responses
- select scenarios from environment-driven inputs
- quote or normalize identifiers
- resolve derived config values

### Main orchestration function

If the script performs multiple steps, export a `main` or `runMain` function and test it directly with mocks.

The test should verify:

- what dependencies it calls
- what inputs it constructs
- what branching it takes on failure
- what it logs when errors occur

The test should not need module-load side effects to reach that logic.

## CLI Wrapper Guidance

The wrapper should be intentionally small. Its job is only to:

- call the exported main function
- log a top-level failure
- translate failure into exit code

That means the wrapper is the right place for:

- `if (require.main === module)`
- top-level `.catch(...)`
- `process.exit(...)`

That means the wrapper is not the right place for:

- parsing logic
- branching business logic
- request construction
- environment-driven flow selection

## Applying This To Existing Scripts

### `scripts/check-local-flow.js`

Export:

- `parseResponseBody`
- `ensureOk`
- `parseToken`
- `selectScenario`
- `main`

Then test those functions directly instead of relying on module auto-run.

### `scripts/ensure-test-db.js`

Export:

- `quoteIdentifier`
- `ensureTestDatabase`

This would let tests verify identifier validation and DB-setup orchestration directly rather than asserting only after require-time execution.

### `scripts/start-local-stack.js`

Export:

- `stopChildren`
- `shutdown`
- `main`

If some helpers remain too stateful to unit test cleanly, that is a sign they may need a smaller internal abstraction boundary.

### `scripts/start-pay-gov-test-server.js`

Export:

- `resolveTestServerEntry`
- a small `main` or `startServer` function

That would let the tests verify spawn arguments and environment shaping without depending on all top-level code executing during import.

## Testing Standard

For script files like these, prefer this order:

1. direct unit tests of exported pure helpers
2. direct unit tests of exported orchestration functions
3. one small CLI-entrypoint test only when needed

This keeps tests stable, makes failures more local and easier to diagnose, and avoids coupling coverage to top-level script execution.

## Proposed Decision

When a script under `scripts/` contains meaningful internal logic, document and refactor it so tests target exported functions, not import side effects.

In practice, that means:

1. export the function(s) that do the real work
2. keep CLI execution in a minimal `require.main === module` block
3. rewrite tests to call exported functions directly
4. keep entrypoint tests narrow and optional
