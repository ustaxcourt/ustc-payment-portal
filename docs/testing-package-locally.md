# Testing This Package As If Published (POC Guide)

Use this guide when you want to validate `@ustaxcourt/payment-portal` from another project before an actual npm publish.

## Goal

Run the package from a separate project exactly like a consumer would:

```bash
npx @ustaxcourt/payment-portal
```

## Safety First

- Use a temporary consumer project for POC testing.
- Use non-production configuration values in your `.env`.
- Do not point to real production databases or AWS environments.
- Stop the local stack when done (`Ctrl+C`) to avoid lingering docker/services.

## Recommended Method: Tarball (`npm pack`)

This is the closest simulation of a real publish because it validates package contents (`files`), `bin`, and runtime dependencies.

### 1. Create a tarball from this repo

From this repository root:

```bash
npm pack
```

This creates a file like:

- `ustaxcourt-payment-portal-0.1.3.tgz`

### 2. Install the tarball in a separate consumer project

In your consumer project:

```bash
npm install /absolute/path/to/ustaxcourt-payment-portal-0.1.3.tgz
```

### 3. Configure env vars in the consumer project

Create a `.env` file in the consumer project with values needed by local startup.

Important: when launched via `npx @ustaxcourt/payment-portal`, the CLI loads `.env` from the consumer project's current working directory.

At minimum, include:

```env
PAY_GOV_TEST_SERVER_ACCESS_TOKEN=local-dev-token
APP_ENV=local
```

You can add optional port overrides if needed:

```env
API_PORT=8080
DB_PORT=5433
PAY_GOV_TEST_SERVER_PORT=3366
```

### 4. Run as a consumer would

From the consumer project:

```bash
npx @ustaxcourt/payment-portal
```

The package CLI will invoke the same local stack startup behavior as:

```bash
npm run start:all
```

## Optional Fast Iteration Method: `npm link`

Use this only for quick local iteration. It is less reliable for publish-surface validation.

In this repository:

```bash
npm link
```

In the consumer project:

```bash
npm link @ustaxcourt/payment-portal
npx @ustaxcourt/payment-portal
```

## Troubleshooting

- If `npx` cannot find the command, reinstall the package in the consumer project.
- If startup fails due to ports in use, free those ports or set your own port env vars.
- If startup fails due to missing env vars, verify `.env` exists in the consumer project root.
- If docker is not running, start Docker Desktop and retry.

### Engine mismatch (`EBADENGINE`)

If install fails with `EBADENGINE`, your consumer project's Node/npm versions do not satisfy that project's `engines` policy.

Quick checks:

```bash
node -v
npm -v
cat .nvmrc
```

After switching Node/npm versions, do a clean reinstall in the consumer project:

```bash
rm -rf node_modules
npm ci
```

Then reinstall the payment-portal tarball (or package version) and retry `npx @ustaxcourt/payment-portal`.

### Stale tarball / package state

If behavior does not match latest local changes:

1. Rebuild package tarball in this repo (`npm pack`).
2. Reinstall that exact tarball in consumer repo.
3. Retry startup.

## Official npm Docs

- `npm pack`: https://docs.npmjs.com/cli/v10/commands/npm-pack
- `npx` / `npm exec`: https://docs.npmjs.com/cli/v10/commands/npx
- `npm link`: https://docs.npmjs.com/cli/v10/commands/npm-link
- Local paths and tarballs in `npm install`: https://docs.npmjs.com/cli/v10/commands/npm-install
