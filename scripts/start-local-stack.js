const { spawn } = require("node:child_process");
const { parsePort } = require("./lib/parsePort");
const { ensurePortsAvailable } = require("./lib/ports");
const { startDockerStack, stopDockerStack } = require("./lib/docker");
const { createLogger } = require("./lib/log");

const log = createLogger("start:server");
const IS_WINDOWS = process.platform === "win32";
const NPM_COMMAND = IS_WINDOWS ? "npm.cmd" : "npm";

const REQUIRED_PORTS = [
  parsePort(
    process.env.PAY_GOV_TEST_SERVER_PORT,
    3366,
    "PAY_GOV_TEST_SERVER_PORT",
  ),
  parsePort(process.env.API_PORT, 8080, "API_PORT"),
  parsePort(process.env.DB_PORT, 5433, "DB_PORT"),
].filter((port, index, ports) => ports.indexOf(port) === index);

// Pay.gov first: it's in-memory, so restarts mid-session invalidate /pay token links.
// The onCrashHint travels with the process so the exit handler stays generic.
const longRunningProcesses = [
  {
    name: "pay-gov",
    command: NPM_COMMAND,
    args: ["run", "start:pay-gov-test-server"],
    onCrashHint:
      "Existing /pay token links may now be invalid because local pay-gov state is in-memory.",
  },
  {
    name: "portal",
    command: NPM_COMMAND,
    args: ["run", "start:dev-server"],
  },
];

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
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = code;
  stopChildren(signal);

  // Early-failure path (docker bring-up failed before any children spawned):
  // no child-close handler will fire, so clean up and exit synchronously.
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
  } catch (error) {
    log.error(error.message);
    process.exit(1);
    return;
  }

  for (const item of longRunningProcesses) {
    const child = spawn(item.command, item.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: IS_WINDOWS,
    });

    child.on("exit", (code, signal) => {
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
