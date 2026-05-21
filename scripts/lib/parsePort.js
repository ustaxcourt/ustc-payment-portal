function parsePort(value, fallback, envName) {
  const raw = value == null || value === "" ? fallback : value;
  const parsed = Number(raw);
  const isValid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535;

  if (!isValid) {
    throw new Error(
      `Invalid ${envName}: ${value}. Expected integer 1-65535.`,
    );
  }

  return parsed;
}

module.exports = { parsePort };
