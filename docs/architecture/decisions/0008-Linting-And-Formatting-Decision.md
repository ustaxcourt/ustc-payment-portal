# 8. Choosing a Linting and Formatting Solution

Date: 2026-05-27

## Status

Accepted

## Context

We currently use a barebones **TSLint** setup for linting and no formatter for Payment Portal. TSLint has been officially depreciated and abandoned since 2019 and needs to be replaced. This is also indicative of a larger problem, we do very little to enforce a code styling guide for Payment Portal. This wasn't a problem when we were a proof of concept, but now with our increased activity we are starting to see more PRs with multiple 'format only' changes. These typically appear either from using Prettier without it being officially configured in the project, or if you are using an AI Agent it will sometimes make 'prettier' styling changes unprompted. We need a Linting/Formatting solution to better enforce code styling, which will help to cut down on format-only changes in PRs.

| Linter | Command                          | Run 1  | Run 2  | Run 3  | Average   |
| ------ | -------------------------------- | ------ | ------ | ------ | --------- |
| TSLint | `tslint --project tsconfig.json` | 1359ms | 1618ms | 1335ms | 1437ms    |
| ESLint | `eslint src`                     | 753ms  | 1012ms | 735ms  | 833ms     |
| Biome  | `biome check .`                  | 259ms  | 343ms  | 272ms  | **291ms** |

Note: These numbers are before including Prettier, except for Biome which has a formatter check built-in when using the `check` command. ESLint and Biome used their default recommended rules + matching the ruleset we originally had setup with TSLint.

## Decision

The Devs met on May 27th, 2026 and accepted Biome as our official solution for Linting and Formatting.

Let's migrate from TSLint (which is depreciated anyway) over to Biome. Biome gives us both a formatter and linter in the same package. While it doesn't have the same wide ruleset and plugin coverage as ESLint, what it does have more than covers what we need for Payment Portal as a Lambda server.

## Consequences

- **Better code styling enforcement** After Biome is installed, we can add it pre-commit hook requirement and as a GH Action to ensure we stay compilant with code styling.
- **Less PR noise** Consistent styling means less cases of random file formatting changes unrelated to the PR at hand.
- **Catching the knucleheaded stuff** Biome rules will help catch unused imports, variables, and parameters, making sure async function calls are properly awaited and etc.

## References

- Biome Docs: [Documentation](https://biomejs.dev/guides/getting-started/)
