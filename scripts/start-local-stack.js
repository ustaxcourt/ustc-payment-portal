const { spawn } = require("node:child_process");
const { parsePort } = require("./lib/parsePort");
const { ensurePortsAvailable } = require("./lib/ports");
const { startDockerStack, stopDockerStack } = require("./lib/docker");
const { createLogger } = require("./lib/log");
const { setupConsumerDb } = require("./lib/dbSetup");

// When true, docker-compose.consumer.yml (postgres-only) is used and the CLI
// runs schema-reset + migrations + seeds programmatically before starting the
// portal. Set by bin/ustc-payment-portal.js for consumer (dev-dependency) mode.
const CONSUMER_MODE = process.env.CONSUMER_MODE === "true";

const log = createLogger(process.env.npm_lifecycle_event || "start");
const IS_WINDOWS = process.platform === "win32";
const NPM_COMMAND = IS_WINDOWS ? "npm.cmd" : "npm";

// Default is to include Pay.gov. `START_PAY_GOV=false` (used by
// `npm run start:portal`) brings up only docker + portal — useful when
// you're iterating on portal code that doesn't touch /init or /process.
const includePayGov =
	String(process.env.START_PAY_GOV || "true").toLowerCase() !== "false";

const REQUIRED_PORTS = [
	...(includePayGov
		? [
				parsePort(
					process.env.PAY_GOV_TEST_SERVER_PORT,
					3366,
					"PAY_GOV_TEST_SERVER_PORT",
				),
			]
		: []),
	parsePort(process.env.API_PORT, 8080, "API_PORT"),
	parsePort(process.env.DB_PORT, 5433, "DB_PORT"),
].filter((port, index, ports) => ports.indexOf(port) === index);

// Pay.gov first: it's in-memory, so restarts mid-session invalidate /pay token links.
// The onCrashHint travels with the process so the exit handler stays generic.
const longRunningProcesses = [
	...(includePayGov
		? [
				{
					name: "pay-gov",
					command: NPM_COMMAND,
					args: ["run", "start:pay-gov-test-server"],
					onCrashHint:
						"Existing /pay token links may now be invalid because local pay-gov state is in-memory.",
				},
			]
		: []),
	{
		name: "portal",
		command: NPM_COMMAND,
		args: ["run", "start:dev-server"],
	},
];

if (!includePayGov) {
	log.info(
		"START_PAY_GOV=false → skipping Pay.gov test server (docker + portal only).",
	);
}

const children = [];
let shuttingDown = false;
let exitCode = 0;

function stopChildren(signal = "SIGTERM") {
	for (const child of children) {
		if (!child.killed) {
			child.kill(signal);
		}
	}
}

function shutdown(code = 0, signal = "SIGTERM") {
	/* istanbul ignore next */
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	exitCode = code;
	stopChildren(signal);

	// Early-failure path (docker bring-up failed before any children spawned):
	// no child-close handler will fire, so clean up and exit synchronously.
	/* istanbul ignore next */
	if (children.length === 0) {
		stopDockerStack();
		process.exit(exitCode);
	}
}

async function main() {
	const ready = await ensurePortsAvailable(REQUIRED_PORTS);
	if (!ready) {
		process.exit(1);
		return;
	}

	try {
		startDockerStack();
		log.info("Docker, pay-gov, and portal logs will stream in this terminal.");
	} catch (error) {
		log.error(error.message);
		process.exit(1);
		return;
	}

	if (CONSUMER_MODE) {
		try {
			await setupConsumerDb();
		} catch (error) {
			log.error("Database setup failed:", error.message);
			stopDockerStack();
			process.exit(1);
			return;
		}
	}

	for (const item of longRunningProcesses) {
		const child = spawn(item.command, item.args, {
			stdio: "inherit",
			shell: IS_WINDOWS,
		});

		child.on("exit", (code, signal) => {
			/* istanbul ignore next */
			if (shuttingDown) {
				return;
			}

			if (signal) {
				shutdown(0, "SIGTERM");
				return;
			}

			const exitedCleanly = code === 0;
			log.error(
				`${item.name} exited ${exitedCleanly ? "unexpectedly with code 0" : `with code ${code}`}. Stopping local stack.`,
			);
			if (item.onCrashHint) {
				log.error(item.onCrashHint);
			}
			shutdown(exitedCleanly ? 1 : code, "SIGTERM");
		});

		child.on("error", (error) => {
			log.error(`Failed to start ${item.name}:`, error);
			shutdown(1, "SIGTERM");
		});

		children.push(child);
	}

	process.on("SIGINT", () => shutdown(130, "SIGINT"));
	process.on("SIGTERM", () => shutdown(143, "SIGTERM"));

	let closedChildren = 0;
	for (const child of children) {
		child.on("close", () => {
			closedChildren += 1;
			if (closedChildren === children.length) {
				stopDockerStack();
				process.exit(exitCode);
			}
		});
	}
}

main().catch((error) => {
	log.error("Startup failed:", error);
	stopDockerStack();
	process.exit(1);
});
