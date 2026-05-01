// Postgres SQLSTATE codes — see https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Detects whether a thrown error is a Postgres unique-violation (SQLSTATE 23505).
 * objection/knex surfaces the pg code on `err.code` directly, or nested under
 * `err.nativeError.code` depending on driver layer — we check both.
 */
export const isUniqueViolation = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  const nativeCode = (err as { nativeError?: { code?: unknown } }).nativeError
    ?.code;
  return code === PG_UNIQUE_VIOLATION || nativeCode === PG_UNIQUE_VIOLATION;
};
