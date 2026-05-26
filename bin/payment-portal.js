#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");
const dotenv = require("dotenv");

const IS_WINDOWS = process.platform === "win32";
const npmCommand = IS_WINDOWS ? "npm.cmd" : "npm";
const packageRoot = path.resolve(__dirname, "..");

// Load .env from the caller's working directory for npx usage in other projects.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const child = spawn(npmCommand, ["--prefix", packageRoot, "run", "start:all"], {
  stdio: "inherit",
  shell: IS_WINDOWS,
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
  console.error("[payment-portal] Failed to run start:all", error);
  process.exit(1);
});
