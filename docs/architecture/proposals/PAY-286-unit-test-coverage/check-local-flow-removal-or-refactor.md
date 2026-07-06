# PAY-286 Check Local Flow: Remove Or Refactor

## Summary

`scripts/check-local-flow.js` should not be treated as obviously dead code just because its current shape looks AI-generated. It is still wired into the developer workflow through `npm run check:local-flow` in `package.json`, so removing it would also remove that smoke-check command.

The stronger case is against the current unit test shape, not necessarily against the script itself. `scripts/check-local-flow.test.js` currently tests module execution by `require()` side effect rather than testing the script's individual functions directly. It also appears stale: the test sets `FEE_ID`, but the script reads `FEE`.

## Recommendation

### Do not remove `scripts/check-local-flow.js` by default

Keep the script if the team still values a local smoke-check command that validates `/init` plus the mock `/pay` token flow against a running local stack.

Reasons to keep it:

- It is still reachable through `npm run check:local-flow`.
- It encodes a useful developer check that is different from pure unit tests.
- It exercises the integrated local path in a way unit tests do not.

Reasons to remove it:

- The team no longer uses `npm run check:local-flow`.
- The same confidence is already provided by integration tests or another smoke test.
- Maintaining a separate script-level flow check has become more confusing than useful.

If the team decides to remove the script, remove both files together:

- `scripts/check-local-flow.js`
- `scripts/check-local-flow.test.js`

Also remove the `check:local-flow` script entry from `package.json`.

## Recommendation For The Test

If the script stays, the test should be rewritten to test functions directly instead of testing module-load side effects.

Current problems in `scripts/check-local-flow.test.js`:

- It depends on `require("./check-local-flow")` auto-running the script.
- It validates process exit behavior more than the helper logic.
- It does not directly test `parseResponseBody`, `ensureOk`, `parseToken`, `selectScenario`, or `main` as separate units.
- It is already out of sync with the implementation (`FEE_ID` versus `FEE`).

## Preferred Refactor

If we keep the smoke-check script, refactor `scripts/check-local-flow.js` into two layers:

1. Export the pure or mostly pure helpers:
   - `parseResponseBody`
   - `ensureOk`
   - `parseToken`
   - `selectScenario`
   - `main`

2. Keep the CLI behavior in a small entrypoint guard:

```js
module.exports = {
  parseResponseBody,
  ensureOk,
  parseToken,
  selectScenario,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    log.error('Failed:', error);
    process.exit(1);
  });
}
```

This split would let the unit test call functions directly and reserve process-exit assertions for one narrow CLI-entrypoint test.

## Suggested Function-Level Test Coverage

If the script stays, the replacement test suite should cover these functions directly.

### `parseResponseBody`

- returns `response.json()` when `content-type` includes `application/json`
- returns `response.text()` for non-JSON responses
- handles missing `content-type` by falling back to text

### `ensureOk`

- resolves without error for `ok === true`
- throws a formatted error using text response bodies
- throws a formatted error using JSON-stringified response bodies

### `parseToken`

- returns `token` when present and non-empty
- extracts `token` from `paymentRedirect`
- throws when neither source provides a token

### `selectScenario`

- returns the petition filing scenario by fee key
- returns the nonattorney exam scenario by fee key
- throws a useful error for an unknown fee

### `main`

- builds the `/init` request using the selected scenario
- calls `/pay` with the token returned from `/init`
- fails when `/init` is non-2xx
- fails when `/pay` is non-2xx
- fails when `/pay` returns HTML that is not the mock pay page

## Proposed Decision

Preferred path:

1. Keep `scripts/check-local-flow.js` because it still backs a real npm command.
2. Replace `scripts/check-local-flow.test.js` with function-level tests after exporting the helpers.
3. Keep only one narrow CLI-entrypoint test, if any, for the `require.main === module` behavior.

Alternative path:

1. Remove both files if the team no longer wants the `check:local-flow` smoke check.
2. Remove the `check:local-flow` npm script at the same time.
3. Rely on integration coverage instead of maintaining a separate smoke-check script.
