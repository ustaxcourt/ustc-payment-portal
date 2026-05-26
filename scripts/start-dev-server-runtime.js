const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const distEntry = path.join(projectRoot, "dist", "devServer.js");
const sourceEntry = path.join(projectRoot, "src", "devServer.ts");

const prefersSource = ["1", "true", "yes"].includes(
  String(process.env.PAYMENT_PORTAL_USE_SOURCE_DEV_SERVER || "").toLowerCase(),
);

const hasDistEntry = fs.existsSync(distEntry);
const hasSourceEntry = fs.existsSync(sourceEntry);

const sourceArgs = ["-r", "ts-node/register/transpile-only", sourceEntry];
const nodeArgs = prefersSource && hasSourceEntry
  ? sourceArgs
  : hasDistEntry
    ? [distEntry]
    : hasSourceEntry
      ? sourceArgs
      : null;

if (!nodeArgs) {
  console.error(
    "[start:dev-server] Could not find dev server entrypoint in dist/ or src/.",
  );
  process.exit(1);
}

const child = spawn(process.execPath, nodeArgs, {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

const forward = (signal) => () => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", forward("SIGINT"));
process.on("SIGTERM", forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code == null ? 1 : code);
});

child.on("error", (error) => {
  console.error("[start:dev-server] Failed to start dev server", error);
  process.exit(1);
});
