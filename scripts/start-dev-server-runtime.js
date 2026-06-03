// Starts the portal dev server, preferring the pre-compiled dist/devServer.js
// when it exists (consumer / post-build), falling back to ts-node for in-repo
// development where the dist/ hasn't been built yet.
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const packageRoot = path.join(__dirname, "..");
const distServerPath = path.join(packageRoot, "dist", "devServer.js");
const srcServerPath = path.join(packageRoot, "src", "devServer.ts");

let child;

if (fs.existsSync(distServerPath)) {
  child = spawn(process.execPath, [distServerPath], {
    stdio: "inherit",
    env: process.env,
    cwd: packageRoot,
  });
} else {
  const tsNodeBin = path.join(
    packageRoot,
    "node_modules",
    "ts-node",
    "dist",
    "bin.js",
  );
  child = spawn(process.execPath, [tsNodeBin, srcServerPath], {
    stdio: "inherit",
    env: process.env,
    cwd: packageRoot,
  });
}

const forward = (signal) => () => {
  if (!child.killed) {
    child.kill(signal);
  }
};
process.on("SIGINT", forward("SIGINT"));
process.on("SIGTERM", forward("SIGTERM"));

child.on("exit", (code, signal) => {
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("[start-dev-server] Failed to spawn:", err.message);
  process.exit(1);
});
