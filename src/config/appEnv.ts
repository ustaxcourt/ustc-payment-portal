/**
 * Single source of truth for APP_ENV (deployment topology). Read APP_ENV
 * only through these helpers — validation lives here so unknown values
 * fail fast at cold start.
 */

export const APP_ENVS = ["local", "dev", "stg", "prod", "test"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const isAppEnv = (value: string): value is AppEnv =>
  (APP_ENVS as readonly string[]).includes(value);

/**
 * Throws on unset or unrecognized APP_ENV — fail fast beats silent
 * miscategorization. Falls back to "test" when only Jest's auto-set
 * NODE_ENV=test is present, so unit tests don't have to set both.
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
