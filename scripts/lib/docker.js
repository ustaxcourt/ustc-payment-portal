const { spawn, spawnSync } = require("node:child_process");
const { createLogger } = require("./log");

const log = createLogger(process.env.npm_lifecycle_event || "start");
const IS_WINDOWS = process.platform === "win32";
let dockerStarted = false;
let dockerLogsProcess = null;

function startDockerLogsStream(sinceTimestamp) {
  log.info("Streaming docker compose logs...");
  dockerLogsProcess = spawn(
    "docker",
    ["compose", "logs", "-f", "--since", sinceTimestamp],
    {
    stdio: "inherit",
    shell: IS_WINDOWS,
    },
  );

  dockerLogsProcess.on("error", (error) => {
    log.warn(`Failed to stream docker logs: ${error.message}`);
  });

  dockerLogsProcess.on("close", (code, signal) => {
    if (!dockerStarted) {
      return;
    }
    if (signal) {
      log.info(`Docker logs stream stopped (${signal}).`);
      return;
    }
    if (code !== 0) {
      log.warn(`Docker logs stream exited with code ${code}.`);
    }
  });
}

function startDockerStack() {
  const startupTimestamp = new Date().toISOString();
  log.info("Bringing up Postgres + migrations (docker compose up --wait)...");
  const result = spawnSync(
    "docker",
    ["compose", "up", "-d", "--wait"],
    { stdio: "inherit", shell: IS_WINDOWS },
  );

  if (result.error) {
    throw new Error(
      `Failed to start docker compose: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    // Dump recent compose logs so the failing service (typically db-init) explains
    // itself instead of leaving the dev to re-run `docker compose logs` manually.
    log.error(
      `docker compose exited with code ${result.status}. Recent container logs:`,
    );
    spawnSync("docker", ["compose", "logs", "--tail", "200"], {
      stdio: "inherit",
      shell: IS_WINDOWS,
    });
    throw new Error(
      `docker compose exited with code ${result.status} before becoming healthy.`,
    );
  }

  dockerStarted = true;
  log.info("Postgres is healthy.");
  startDockerLogsStream(startupTimestamp);
}

function stopDockerStack() {
  if (!dockerStarted) {
    return;
  }
  dockerStarted = false;

  if (dockerLogsProcess && !dockerLogsProcess.killed) {
    dockerLogsProcess.kill("SIGTERM");
  }
  dockerLogsProcess = null;

  log.info("Stopping docker compose stack...");
  spawnSync("docker", ["compose", "stop"], {
    stdio: "inherit",
    shell: IS_WINDOWS,
  });
}

module.exports = { startDockerStack, stopDockerStack };
