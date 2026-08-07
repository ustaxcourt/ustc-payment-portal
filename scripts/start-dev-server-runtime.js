"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { wireChild } = require("./lib/wireChild");

const packageRoot = path.join(__dirname, "..");
const distServerPath = path.join(packageRoot, "dist", "devServer.js");
const srcServerPath = path.join(packageRoot, "src", "devServer.ts");

function resolveTsxCliPath(resolveModulePath = require.resolve) {
  try {
    return resolveModulePath("tsx/cli");
  } catch (err) {
    console.error(
      `[start-dev-server] Unable to resolve tsx/cli. Install project dependencies with \`npm install\` before running \`npm run start:dev-server\`. ${err.message}`,
    );
    process.exit(1);
    return null;
  }
}

function resolveServerEntryPath(existsSync = fs.existsSync) {
  if (existsSync(srcServerPath)) {
    return { type: "src", path: srcServerPath };
  }

  if (existsSync(distServerPath)) {
    return { type: "dist", path: distServerPath };
  }

  console.error(
    `[start-dev-server] Could not find a dev server entrypoint. Expected either ${srcServerPath} or ${distServerPath}. Build the project or install dependencies before running \`npm run start:dev-server\`.`,
  );
  process.exit(1);
  return null;
}

function startDevServerRuntime(options = {}) {
  const { resolveTsxCli = resolveTsxCliPath, resolveEntryPath = resolveServerEntryPath } = options;
  let child;
  const entrypoint = resolveEntryPath();

  if (!entrypoint) {
    return;
  }

  if (entrypoint.type === "src") {
    // In a repo checkout, prefer source so local scripts don't depend on whatever
    // happens to be in dist (for example after a plain `npm run tsc`).
    const tsxCli = resolveTsxCli();
    if (!tsxCli) {
      return;
    }

    child = spawn(process.execPath, [tsxCli, entrypoint.path], {
      stdio: "inherit",
      env: process.env,
      cwd: packageRoot,
    });
  } else {
    // Installed package runtime: source is absent, so execute the built server.
    child = spawn(process.execPath, [entrypoint.path], {
      stdio: "inherit",
      env: process.env,
      cwd: packageRoot,
    });
  }

  wireChild(child);

  child.on("error", (err) => {
    console.error("[start-dev-server] Failed to spawn:", err.message);
    process.exit(1);
  });
}

if (require.main === module) {
  startDevServerRuntime();
}

module.exports = {
  resolveServerEntryPath,
  resolveTsxCliPath,
  startDevServerRuntime,
};
