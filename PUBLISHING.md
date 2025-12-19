# Publishing to npmjs.org

This document outlines the approach for publishing versioned updates of `@ustaxcourt/payment-portal` to npmjs.org, making them available via npm install.

## Prerequisites

- **Public GitHub repository**: Required for npm provenance.
- **npm Trusted Publishing**: Configured for the repo/workflow.
- **Changesets**: Used for versioning and changelog generation.

## Publishing Workflow

### 1. Development Phase

1. **Create a feature branch**:
   ```bash
   git switch -c feature/your-feature-name
   ```

2. **Make your changes** to the codebase.

3. **Add a changeset** to document your changes:
   ```bash
   npx changeset add
   ```
   - Select the package to version (`@ustaxcourt/payment-portal`)
   - Choose the semver bump type:
     - `patch`: Bug fixes and minor changes (0.1.0 → 0.1.1)
     - `minor`: New features, backward compatible (0.1.0 → 0.2.0)
     - `major`: Breaking changes (0.1.0 → 1.0.0)
   - Write a concise summary of changes for the changelog

4. **Commit and push**:
   ```bash
   git add .
   git commit -m "feat: your feature with changeset"
   git push -u origin feature/your-feature-name
   ```

5. **Open a Pull Request** to `main` and get it reviewed.

### 2. Versioning Phase

1. **Merge your PR** to `main`.

2. **Changesets bot** automatically opens a "Version Packages" PR that:
   - Consumes the changeset files
   - Updates `package.json` version
   - Updates/creates `CHANGELOG.md`

3. **Review the Version PR**:
   - Verify the version bump is appropriate
   - Check the changelog entry is clear and accurate
   - Merge the PR when ready to publish

### 3. Publishing Phase

1. **Automatic publish** via GitHub Actions:
   - On merge of the Version PR, the `publish.yml` workflow runs
   - Uses OIDC Trusted Publishing (no tokens)
   - Builds the package and publishes to npm with provenance

2. **Verify the publish**:
   ```bash
   npm view @ustaxcourt/payment-portal version
   npm view @ustaxcourt/payment-portal dist-tags
   ```

## Installation

Consumers can install the package:

```bash
# As a dependency
npm install @ustaxcourt/payment-portal

# As a dev dependency
npm install --save-dev @ustaxcourt/payment-portal
```

## Technical Implementation

### CI/CD Workflows

- **CI workflow** (`.github/workflows/ci.yml`):
  - Runs on every push/PR
  - Builds, lints, and tests the code

- **Publish workflow** (`.github/workflows/publish.yml`):
  - Triggered after CI passes and on push to `main`
  - Uses `changesets/action@v1` to:
    - Create/update Version PR when changesets exist
    - Publish to npm when Version PR is merged

### Package Configuration

- **`package.json`**:
  ```json
  {
    "name": "@ustaxcourt/payment-portal",
    "version": "0.1.0",
    "main": "dist/index.js",
    "module": "dist/index.mjs",
    "types": "dist/index.d.ts",
    "files": ["dist", "README.md", "LICENSE"],
    "publishConfig": {
      "access": "public"
    },
    "scripts": {
      "build": "tsup src/index.ts --format cjs,esm --dts",
      "ci:publish": "npm run build && changeset publish"
    }
  }
  ```

- **`.changeset/config.json`**:
  ```json
  {
    "access": "public",
    "baseBranch": "main"
  }
  ```

## Troubleshooting

- **Missing Trusted Publisher**: Verify the npm package has the GitHub repo/workflow configured as a Trusted Publisher.
- **Version conflicts**: If a version already exists, you'll need to bump to a new version.

## Best Practices

- **One changeset per PR**: Add exactly one changeset per PR to keep changelog entries focused.
- **Clear changelog messages**: Write user-focused changelog entries that explain what changed and why.
- **Semantic versioning**: Follow SemVer strictly to maintain consumer trust.
- **Small, focused releases**: Prefer smaller, more frequent releases over large, infrequent ones.

## Example Workflow

Here's a complete example of making a change and publishing:

```bash
# 1. Create feature branch
git checkout main
git pull
git checkout -b fix/error-handling

# 2. Make your changes
# ... edit files ...

# 3. Add changeset
npx changeset add
# Choose: patch
# Summary: "Improve error handling in transaction requests"

# 4. Commit and push
git add .
git commit -m "fix: improve error handling in transaction requests"
git push -u origin fix/error-handling

# 5. Open PR and merge to main (via GitHub UI)

# 6. Wait for "Version Packages" PR to be created automatically

# 7. Review and merge "Version Packages" PR (via GitHub UI)

# 8. Verify publish succeeded
npm view @ustaxcourt/payment-portal version
# Should show the new version
```
