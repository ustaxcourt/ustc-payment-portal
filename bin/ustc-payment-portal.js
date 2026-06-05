#!/usr/bin/env node
// CLI entry point for @ustaxcourt/payment-portal used as a dev dependency.
// Usage:
//   ustc-payment-portal start  (portal + pay-gov + db)
//   ustc-payment-portal stop   (tear down docker)
"use strict";

const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const { wireChild } = require("../scripts/lib/wireChild");

// The package root — where this package is installed (e.g. node_modules/@ustaxcourt/payment-portal/).
const packageRoot = path.join(__dirname, "..");

// 1. Apply zero-config defaults before loading any env file.
//    Only set values that are not already in the environment.
//    API_PORT, PAY_GOV_TEST_SERVER_PORT, and DB_PORT are omitted — start-local-stack.js,
//    docker-compose.consumer.yml, dbSetup.js, and knexConfig.ts all fall back to their
//    own defaults (8080, 3366, 5433). Consumers may override them via .env.payment-portal
//    (step 2 below).
const DEV_DEFAULTS = {
  APP_ENV: "local",
  NODE_ENV: "development",
  DB_HOST: "localhost",
  DB_USER: "user",
  DB_PASSWORD: "password",
  DB_NAME: "mydb",
  PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID: "asdf123",
  PAY_GOV_TEST_SERVER_ACCESS_TOKEN: "asdf123",
  PAY_GOV_NODE_ENV: "local",
  LOG_LEVEL: "info",
};
for (const [key, value] of Object.entries(DEV_DEFAULTS)) {
  if (!(key in process.env)) {
    process.env[key] = value;
  }
}

// 2. Load .env.payment-portal from the consumer's CWD.
//    Only API_PORT, PAY_GOV_TEST_SERVER_PORT, and DB_PORT are honoured —
//    nothing else is read from this file.
const PORT_KEYS = ["API_PORT", "PAY_GOV_TEST_SERVER_PORT", "DB_PORT"];
const consumerEnvFile = path.join(process.cwd(), ".env.payment-portal");
if (fs.existsSync(consumerEnvFile)) {
  const parsed = require("dotenv").parse(fs.readFileSync(consumerEnvFile));
  for (const key of PORT_KEYS) {
    if (parsed[key] != null) {
      process.env[key] = parsed[key];
    }
  }
}

// 3. Derive SOAP_URL / PAYMENT_URL from the (possibly overridden) port.
//    Fall back to 3366, matching the parsePort default in start-local-stack.js.
const payGovPort = process.env.PAY_GOV_TEST_SERVER_PORT || "3366";
if (!process.env.SOAP_URL) {
  process.env.SOAP_URL = `http://localhost:${payGovPort}/wsdl`;
}
if (!process.env.PAYMENT_URL) {
  process.env.PAYMENT_URL = `http://localhost:${payGovPort}/pay`;
}

// 4. Point docker compose at the consumer-mode compose file (postgres-only).
//    The docker commands in scripts/lib/docker.js inherit this env var.
process.env.COMPOSE_FILE = path.join(packageRoot, "docker-compose.consumer.yml");

// 5. Signal consumer mode so start-local-stack.js runs the programmatic DB setup
//    instead of relying on the db-init service in docker-compose.yml.
process.env.CONSUMER_MODE = "true";

// ── Parse subcommand ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const subcommand = args[0] || "start";

if (subcommand === "stop") {
  const result = spawnSync("docker", ["compose", "stop"], {
    stdio: "inherit",
    cwd: packageRoot,
    env: process.env,
  });
  process.exit(result.status ?? 0);
}

if (subcommand !== "start") {
  console.error(`[ustc-payment-portal] Unknown subcommand: ${subcommand}`);
  console.error("Usage: ustc-payment-portal start");
  console.error("       ustc-payment-portal stop");
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
  env: process.env,
});

wireChild(child);

child.on("error", (err) => {
  console.error("[ustc-payment-portal] Failed to start:", err.message);
  process.exit(1);
});
