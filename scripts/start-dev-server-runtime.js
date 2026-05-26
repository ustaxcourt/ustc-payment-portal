const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const distEntry = path.join(projectRoot, "dist", "devServer.js");
const sourceEntry = path.join(projectRoot, "src", "devServer.ts");

const nodeArgs = fs.existsSync(sourceEntry)
  ? ["-r", "ts-node/register/transpile-only", sourceEntry]
  : [distEntry];

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
