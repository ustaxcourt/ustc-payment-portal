// Scripts use console (not the project's pino logger) deliberately: they run
// outside the app process, before app config loads, and must keep zero startup
// cost. This factory wraps console with a stable prefix so every script has
// the same shape and there is one seam to swap implementations later.
function createLogger(prefix) {
	const tag = `[${prefix}]`;
	return {
		tag,
		info: (message) => console.log(`${tag} ${message}`),
		warn: (message) => console.warn(`${tag} ${message}`),
		error: (message, ...rest) => console.error(`${tag} ${message}`, ...rest),
	};
}

module.exports = { createLogger };
