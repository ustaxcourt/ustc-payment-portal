const { spawnSync } = require("node:child_process");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { createLogger } = require("./log");

const log = createLogger(process.env.npm_lifecycle_event || "start");
let warnedMissingLsof = false;

// Killing Docker's port forwarder takes down Docker Desktop itself, so these are
// never offered for termination. A container that really owns a required port
// surfaces as a clear `docker compose up` error instead.
const DOCKER_OWNED = /Docker\.app|com\.docker\.|docker-proxy|dockerd|vpnkit|rootlesskit/i;
const commandByPid = new Map();

function getListeningPids(port) {
  const result = spawnSync(
    "lsof",
    ["-nP", "-ti", `tcp:${port}`, "-sTCP:LISTEN"],
    { encoding: "utf8" },
  );

  if (result.error) {
    if (result.error.code === "ENOENT") {
      if (!warnedMissingLsof) {
        warnedMissingLsof = true;
        log.warn(
          "`lsof` is not available on this platform; skipping port preflight. " +
            "Install lsof (macOS/Linux) or free the ports manually before re-running.",
        );
      }
      return [];
    }
    throw result.error;
  }

  if (result.status !== 0 && !result.stdout.trim()) {
    return [];
  }

  // Filter to positive integers — Number("") is 0, and process.kill(0, ...) would
  // signal the entire process group instead of a single PID.
  return result.stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function getCommand(pid) {
  if (!commandByPid.has(pid)) {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "comm="], {
      encoding: "utf8",
    });
    commandByPid.set(pid, (result.stdout || "").trim());
  }
  return commandByPid.get(pid);
}

function isDockerOwned(pid) {
  return DOCKER_OWNED.test(getCommand(pid));
}

function describePid(pid) {
  const command = getCommand(pid);
  return command ? `${pid} (${command})` : String(pid);
}

function getKillablePids(port) {
  return getListeningPids(port).filter((pid) => !isDockerOwned(pid));
}

function listUsedPorts(requiredPorts) {
  const listening = requiredPorts.map((port) => ({
    port,
    pids: getListeningPids(port),
  }));
  const used = listening
    .map(({ port, pids }) => ({
      port,
      pids: pids.filter((pid) => !isDockerOwned(pid)),
    }))
    .filter((item) => item.pids.length > 0);
  const dockerHeld = listening
    .filter(({ pids }) => pids.some(isDockerOwned))
    .map(({ port }) => port);
  return { used, dockerHeld };
}

function killPids(pids) {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error && error.code !== "ESRCH") {
        throw error;
      }
    }
  }
}

function formatUsedPorts(usedPorts) {
  return usedPorts
    .map(
      (item) =>
        `port ${item.port} -> ${item.pids.map(describePid).join(", ")}`,
    )
    .join("; ");
}

async function waitForPortsFree(ports, timeoutMs = 5000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stillBound = ports.filter((port) => getKillablePids(port).length > 0);
    if (stillBound.length === 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function killAndConfirm(usedPorts) {
  const pidsToKill = [...new Set(usedPorts.flatMap((item) => item.pids))];
  killPids(pidsToKill);
  // SIGTERM is asynchronous — poll until the ports are actually free, otherwise
  // the portal can still race the kernel and hit EADDRINUSE on bind.
  const freed = await waitForPortsFree(usedPorts.map((item) => item.port));
  if (!freed) {
    log.error(
      "Ports did not become free within 5s after SIGTERM. Aborting startup.",
    );
    return false;
  }
  return true;
}

async function ensurePortsAvailable(requiredPorts) {
  commandByPid.clear();
  const { used: usedPorts, dockerHeld } = listUsedPorts(requiredPorts);
  if (dockerHeld.length > 0) {
    log.info(
      `Leaving Docker-managed port(s) ${dockerHeld.join(", ")} alone; ` +
        "run `docker compose down` if a stale container is holding them.",
    );
  }
  if (usedPorts.length === 0) {
    return true;
  }

  const details = formatUsedPorts(usedPorts);
  const shouldAutoKill = ["1", "true", "yes", "y"].includes(
    String(process.env.AUTO_KILL_PORTS || "").toLowerCase(),
  );

  if (shouldAutoKill) {
    log.info(`AUTO_KILL_PORTS enabled. Stopping: ${details}`);
    return killAndConfirm(usedPorts);
  }

  if (!stdin.isTTY) {
    log.error(`Required ports are in use: ${details}`);
    log.error("Re-run with AUTO_KILL_PORTS=true to auto-stop them.");
    return false;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `${log.tag} Required ports are in use (${details}). Kill these processes now? [y/N] `,
  );
  rl.close();

  if (!["y", "yes"].includes(answer.trim().toLowerCase())) {
    log.error("Startup cancelled because required ports are occupied.");
    return false;
  }

  return killAndConfirm(usedPorts);
}

module.exports = { ensurePortsAvailable };
