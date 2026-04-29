/**
 * Single source of truth for the deployment environment of this service.
 *
 * `APP_ENV` answers "where is this code running" (laptop, dev, stg, prod).
 * `NODE_ENV` is left to its conventional purpose — Node's runtime mode
 * (`development | production | test`) consumed by Node, Express, knex,
 * and Jest. The two are deliberately decoupled.
 *
 * Read `APP_ENV` only through these helpers so that:
 *   - validation happens in one place (unknown values fail fast),
 *   - tests have one seam to mock,
 *   - downstream code never carries string literals like "stg" inline.
 */

export const APP_ENVS = ["local", "dev", "stg", "prod", "test"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const isAppEnv = (value: string): value is AppEnv =>
  (APP_ENVS as readonly string[]).includes(value);

/**
 * Returns the validated `APP_ENV` for the current process.
 *
 * Throws if `APP_ENV` is unset or unrecognized — a misconfigured Lambda
 * should fail at cold start rather than silently treat itself as prod.
 *
 * Falls back to `"test"` when Jest's auto-set `NODE_ENV=test` is the only
 * signal available, so unit tests don't have to set both variables.
 */
export const getAppEnv = (): AppEnv => {
  const raw = process.env.APP_ENV;

  if (!raw) {
    if (process.env.NODE_ENV === "test") {
      return "test";
    }
    throw new Error("APP_ENV is not set");
  }

  if (!isAppEnv(raw)) {
    throw new Error(
      `Invalid APP_ENV "${raw}". Expected one of: ${APP_ENVS.join(", ")}`
    );
  }

  return raw;
};

export const isLocal = (): boolean => getAppEnv() === "local";

export const isDeployed = (): boolean => {
  const env = getAppEnv();
  return env === "dev" || env === "stg" || env === "prod";
};
