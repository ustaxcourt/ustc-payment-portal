#!/usr/bin/env node
// CLI entry point for @ustaxcourt/payment-portal used as a dev dependency.
// Usage:
//   payment-portal start  (portal + pay-gov + db)
//   payment-portal stop   (tear down docker)


const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const { wireChild } = require("../scripts/lib/wireChild");

// The package root — where this package is installed (e.g. node_modules/@ustaxcourt/payment-portal/).
const packageRoot = path.join(__dirname, "..");

// 1. The portal's own runtime config — applied on top of process.env so the
//    child always gets these values regardless of what the consumer's shell has
//    set. This keeps the portal's DB, app env, and token config isolated from
//    consumer tools (e.g. DAWSON) that export their own DB_USER, DB_PASSWORD, etc.
//    API_PORT, PAY_GOV_TEST_SERVER_PORT, and DB_PORT are intentionally absent —
//    consumers may override those via .env.payment-portal (step 2 below).
const PORTAL_ENV = {
  APP_ENV: "local",
  NODE_ENV: "development",
  DB_HOST: "localhost",
  DB_USER: "user",
  DB_PASSWORD: "password",
  DB_NAME: "mydb",
  PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID: "asdf123",
  PAY_GOV_NODE_ENV: "local",
  LOG_LEVEL: "info",
};

// 2. Load port overrides from .env.payment-portal in the consumer's CWD.
//    Only API_PORT, PAY_GOV_TEST_SERVER_PORT, and DB_PORT are honoured.
//    Read into a separate object — never from process.env — so the consumer's
//    shell environment cannot influence the portal's port config.
const PORT_KEYS = ["API_PORT", "PAY_GOV_TEST_SERVER_PORT", "DB_PORT"];
const portOverrides = {};
const consumerEnvFile = path.join(process.cwd(), ".env.payment-portal");
if (fs.existsSync(consumerEnvFile)) {
  const parsed = require("dotenv").parse(fs.readFileSync(consumerEnvFile));
  for (const key of PORT_KEYS) {
    if (parsed[key] != null) {
      portOverrides[key] = parsed[key];
    }
  }
}

// 3. Derive SOAP_URL / PAYMENT_URL from the (possibly overridden) pay-gov port.
const payGovPort = portOverrides.PAY_GOV_TEST_SERVER_PORT || "3366";
const SOAP_URL = `http://localhost:${payGovPort}/wsdl`;
const PAYMENT_URL = `http://localhost:${payGovPort}/pay`;

// 4. Fixed infrastructure vars — not from process.env, always portal-owned.
const COMPOSE_FILE = path.join(packageRoot, "docker-compose.consumer.yml");
const CONSUMER_MODE = "true";

// ── Parse subcommand ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const subcommand = args[0] || "start";

if (subcommand === "stop") {
  const result = spawnSync("docker", ["compose", "stop"], {
    stdio: "inherit",
    cwd: packageRoot,
    env: { ...process.env, COMPOSE_FILE: path.join(packageRoot, "docker-compose.consumer.yml") },
  });
  process.exit(result.status ?? 0);
}

if (subcommand !== "start") {
  console.error(`[ustc-payment-portal] Unknown subcommand: ${subcommand}`);
  console.error("Usage: payment-portal start");
  console.error("       payment-portal stop");
  process.exit(1);
}

// ── Spawn start-local-stack.js with cwd=packageRoot ──────────────────────────
// Running from packageRoot ensures that:
//  - npm scripts (start:dev-server, start:pay-gov-test-server) resolve from the right package.json
//  - docker compose uses the package's docker-compose.consumer.yml (via COMPOSE_FILE env var)
//  - relative requires inside the scripts resolve correctly

const stackScript = path.join(packageRoot, "scripts", "start-local-stack.js");
const child = spawn(process.execPath, [stackScript], {
  stdio: "inherit",
  cwd: packageRoot,
  env: {
    ...process.env,
    ...PORTAL_ENV,
    DB_PORT: portOverrides.DB_PORT || "5433",
    API_PORT: portOverrides.API_PORT || "8080",
    PAY_GOV_TEST_SERVER_PORT: portOverrides.PAY_GOV_TEST_SERVER_PORT || "3366",
    SOAP_URL,
    PAYMENT_URL,
    COMPOSE_FILE,
    CONSUMER_MODE,
  },
});

wireChild(child);

child.on("error", (err) => {
  console.error("[ustc-payment-portal] Failed to start:", err.message);
  process.exit(1);
});
