const PG_UNIQUE_VIOLATION = "23505";
const PG_LOCK_NOT_AVAILABLE = "55P03";
const PG_DEADLOCK_DETECTED = "40P01";

export const getPostgresErrorCode = (err: unknown): string | undefined => {
	if (!err || typeof err !== "object") {
		return undefined;
	}
	const code = (err as { code?: unknown }).code;
	if (typeof code === "string") {
		return code;
	}
	const nativeCode = (err as { nativeError?: { code?: unknown } }).nativeError
		?.code;
	return typeof nativeCode === "string" ? nativeCode : undefined;
};

const hasPostgresErrorCode = (err: unknown, sqlState: string): boolean => {
	const code = getPostgresErrorCode(err);
	return code === sqlState;
};

export const isUniqueViolation = (err: unknown): boolean =>
	hasPostgresErrorCode(err, PG_UNIQUE_VIOLATION);

export const isLockNotAvailable = (err: unknown): boolean =>
	hasPostgresErrorCode(err, PG_LOCK_NOT_AVAILABLE);

export const isDeadlockDetected = (err: unknown): boolean =>
	hasPostgresErrorCode(err, PG_DEADLOCK_DETECTED);

export const isClaimContentionError = (err: unknown): boolean =>
	isLockNotAvailable(err) || isDeadlockDetected(err);
