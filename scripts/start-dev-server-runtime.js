

const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { wireChild } = require("./lib/wireChild");

const packageRoot = path.join(__dirname, "..");
const distServerPath = path.join(packageRoot, "dist", "devServer.js");
const srcServerPath = path.join(packageRoot, "src", "devServer.ts");

let child;

if (fs.existsSync(distServerPath)) {
  // Handles running the built dev server (`npx @ustaxcourt/payment-portal`) )
  child = spawn(process.execPath, [distServerPath], {
    stdio: "inherit",
    env: process.env,
    cwd: packageRoot,
  });
} else {
  // Local dev fallback: dist hasn't been built yet, run source via tsx.
  const tsxCli = require.resolve("tsx/cli");
  child = spawn(process.execPath, [tsxCli, srcServerPath], {
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
