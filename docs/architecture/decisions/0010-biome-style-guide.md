# 10. Choosing a Formatting and Linting

Date: 2026-07-14

## Status

Accepted

## Context

It's time for us to establish a code style guide for Payment Portal, and enforce linting rules via Biome. This will help us ensure consistency and maintainability in our code.

## Decision

The team met this week and agreed to use Biome's recommended rule group, and the default settings for the formatter:

```json
{
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "ignore": [],
    "attributePosition": "auto",
    "indentStyle": "tab",
    "indentWidth": 2,
    "lineWidth": 80,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "arrowParentheses":"always",
      "bracketSameLine": false,
      "bracketSpacing": true,
      "delimiterSpacing": false,
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "json": {
    "formatter": {
      "trailingCommas": "none"
    }
  }
}
```

**These are already set behind the scenes in Biome.json, we don't need to include them in the file**

### Linting Rules
**Rules typically have options that can be set or overriden (like the threshold complexity score for noExcessiveCognitiveComplexity). See links to the Biome docs below.**

- [Recommended Rule Group JS](https://biomejs.dev/linter/javascript/rules/#recommended-rules): (Not listed here for sake of being brief. Most of these will return no issues due to being specific to front-end JS, while the rest will be general best practice rules for JS as a whole.) Note that TS compiles to JS, so the rules still apply for either language. Gets applied via `"preset": "recommended"` under `linter.rules` in [biome.json](https://github.com/ustaxcourt/ustc-payment-portal/blob/aa29027ae0aa3adc50bfe0988f184e09cdb06a84/biome.json).
- [Recommended Rule Group JSON](https://biomejs.dev/linter/json/rules/#recommended-rules): Gets applied via `"preset": "recommended"` under `linter.rules` in [biome.json](https://github.com/ustaxcourt/ustc-payment-portal/blob/aa29027ae0aa3adc50bfe0988f184e09cdb06a84/biome.json).

#### Rules selected specifically for Payment Portal
- [noExcessiveCognitiveComplexity](https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/) Biome's version of ESLint's complexity rule, covers both cyclomatic complexity and general function complexity. Requires a complexity score of 15 or less for a function to pass. We can reduce the complexity score of a function by breaking it up into smaller, testable pieces, and simplify any nested conditionals as much as possible.
- [noFloatingPromises](https://biomejs.dev/linter/rules/no-floating-promises/) Make sure that any promises are properly handled. Promises in code that aren't handled via `.then()`, `.catch()`, awaiting it, returning it, or voiding it are flagged. This rule is currently in nursery (their version of beta), and passes 85% (as of Biome 2.1) of the test cases for it's esLint equivalent. **Treat violations of this rule as advisory only until the rule comes out of nursery.**
- [noConsole](https://biomejs.dev/linter/rules/no-console/) Enforce using Pino logs only in production code. For local code (anything for running on a dev machine or as the npm package), normal console logs are fine and can be added as an ignore case.
