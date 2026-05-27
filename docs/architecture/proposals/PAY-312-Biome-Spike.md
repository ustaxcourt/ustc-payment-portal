# Biome versus ESLint

Biome is a relatively new (compared to ESLint) Rust-based toolchain that combines linting and formatting in the same package. We will be comparing Biome directly with its equivalent ESLint setup (ESLint + Prettier), which is typically the direct replacement for TSLint setups.

## Tech Stack

Biome is written in Rust, causing it to perform significantly faster than ESLint written in JavaScript. Biome takes about **<10 MS per file** using Rust compared to ESLint's **~100-500 MS per file** when using its default single-threaded Node.js.

## Formatting

By default, Biome has it's own Formatter included in the same package as the linter. ESLint requires installing and setting up Prettier separately in order to format your code base. Biome covers setting up both it's Formatter and Linter in the same `biome.json` file. ESLint + Prietter on the other requires an entirely separate prettier config file from ESLint's configuration. Biome currently sits at **97%** compability with Prettier. You can read more about the differences [here.](https://biomejs.dev/formatter/differences-with-prettier/) One of the major differences is caused by which parser each option uses. ESLint uses the Babel parser, which allows looser enforcement of rules, cause errors or syntax errors to be missed. In comparison, Biome's built-in custom Parser has stricter enforcement.

**Something important to note: one of the reasons Biome is so fast is that it
parses each file only once, then reuses that result for both linting and
formatting. Rather than generating an AST (Abstract Syntax Tree), which strips
out whitespace and comments to represent only the logical structure of code,
Biome generates a CST (Concrete Syntax Tree). A CST is similar to an AST but
also preserves trivia -- spaces, tabs, newlines, and comments -- so nothing
from the original source is lost. This lossless representation is what allows
Biome to handle both linting and formatting in a single parse pass.**

## Linting (Rules and Plugins)

The creators of Biome are aiming for parity when it comes to Linting rules compared to ESLint, but are still several years behind in coverage. We currently have a pretty barebones TSLint setup, which is more than covered by Biome's rulesets. Here's our current setup:

```json
{
  "defaultSeverity": "error",
  "extends": ["tslint:recommended"],
  "jsRules": {},
  "rules": {
    "trailing-comma": [true],
    "no-console": false,
    "no-unused-variable": [true]
  },
  "rulesDirectory": []
}
```

Here's what the equivalent `biome.json` configuration would look like:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "useTrailingCommas": "error"
      },
      "correctness": {
        "noUnusedVariables": "error"
      }
    }
  },
  // When we do the style guide story, we can enforce it here in the formatter.
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

### Plugins

Plugins work with Biome using the **GritQL** Query Language. With it, you can write custom reporting rules as `.grit` files, which then get added to the Biome.json file. You can read more about them [here in the Biome docs.](https://biomejs.dev/linter/plugins/). To give you a sneak peek, here's what a rule reporting all usages of `Object.assign()` looks like:

```text
`$fn($args)` where {
    $fn <: `Object.assign`,
    register_diagnostic(
        span = $fn,
        message = "Prefer object spread instead of `Object.assign()`"
    )
}
```

**NOTE: GritQL assumes a target language to run plugins against, but if none is defined it assumes you are using JavaScript. Currently Biome only supports JavaScript and CSS for GritQL plugins.**

## Dependencies

Biome wins out when it comes to additional dependencies (or lack of needing them) when compared to ESLint. Since Biome already has a Formatter built into it, you only need to add the core Biome package as a devDependency. Comparing that to ESLint, which requires `eslint, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, prettier, and eslint-config-prettier` to cover Payment Portal.

## Type Aware Errors

This is where ESLint current wins (atleast for now) over Biome. Biome recently got type-aware rule coverage in v2, but roughly only covers 85% of what type aware errors over in ESLint can do with **typescript-eslint**. This will get better over time, but its something to be aware of if we proceed with Biome.

**As of 2.1, Biome Currently Supports:**

- `noFloatingPromises` rule (85% coverage compared to eslint equivalent)
  - NOTE: If no explicit return type is defined, but it does return a promise, Biome may not detect it. Since we are using typescript and should be including a explicit return type, I don't see this being much of a problem.
- `noMisuedPromises` rule (experimental)

## Conclusion

Due to Payment Portal's 'Greenfield' nature and relatively small size, its low risk if we want to give Biome a shot, with the upsides being increased preformance, less configuration files, and less devDependencies. If for any reason we find the ruleset coverage lacking on Biome, we can fairly easily switch over to ESLint.
