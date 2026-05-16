const { spawnSync } = require("node:child_process");
const { createLogger } = require("./log");

const log = createLogger("start:server");
const IS_WINDOWS = process.platform === "win32";
let dockerStarted = false;

function startDockerStack() {
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
    throw new Error(
      `docker compose exited with code ${result.status} before becoming healthy.`,
    );
  }

  dockerStarted = true;
  log.info("Postgres is healthy.");
}

function stopDockerStack() {
  if (!dockerStarted) {
    return;
  }
  log.info("Stopping docker compose stack...");
  spawnSync("docker", ["compose", "stop"], {
    stdio: "inherit",
    shell: IS_WINDOWS,
  });
}

module.exports = { startDockerStack, stopDockerStack };
