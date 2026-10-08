const { spawn } = require("node:child_process");
const path = require("node:path");
const { parsePort } = require("./lib/parsePort");
const { createLogger } = require("./lib/log");
const { wireChild } = require("./lib/wireChild");

const log = createLogger("start:pay-gov-test-server");
const PACKAGE_NAME = "@ustaxcourt/ustc-pay-gov-test-server";

function resolveTestServerEntry() {
  return require.resolve(`${PACKAGE_NAME}/dist/server.js`);
}

function resolvePayGovNodeEnv(env = process.env) {
  return env.PAY_GOV_NODE_ENV || "local";
}

function startPayGovTestServer() {
  const port = parsePort(
    process.env.PAY_GOV_TEST_SERVER_PORT,
    3366,
    "PAY_GOV_TEST_SERVER_PORT",
  );
  const payGovNodeEnv = resolvePayGovNodeEnv();

  const entry = resolveTestServerEntry();
  const packageDir = path.dirname(
    require.resolve(`${PACKAGE_NAME}/package.json`),
  );

  log.info(`starting on port ${port} with NODE_ENV=${payGovNodeEnv}`);

  const child = spawn(process.execPath, [entry], {
    cwd: packageDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(port),
      // The test server only skips its bearer-token check when APP_ENV=local.
      APP_ENV: "local",
      NODE_ENV: payGovNodeEnv,
    },
  });

  wireChild(child);

  child.on("error", (error) => {
    log.error("failed to spawn:", error);
    process.exit(1);
  });
}

if (require.main === module) {
  startPayGovTestServer();
}

module.exports = {
  resolvePayGovNodeEnv,
  resolveTestServerEntry,
  startPayGovTestServer,
};
