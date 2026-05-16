const { spawn } = require("node:child_process");
const path = require("node:path");
const { parsePort } = require("./lib/parsePort");
const { createLogger } = require("./lib/log");

const log = createLogger("start:pay-gov-test-server");
const PACKAGE_NAME = "@ustaxcourt/ustc-pay-gov-test-server";

// The package's `main` is a barrel of type exports; the runnable server is dist/server.js.
function resolveTestServerEntry() {
  return require.resolve(`${PACKAGE_NAME}/dist/server.js`);
}

const port = parsePort(
  process.env.PAY_GOV_TEST_SERVER_PORT,
  3366,
  "PAY_GOV_TEST_SERVER_PORT",
);
const token = process.env.PAY_GOV_TEST_SERVER_ACCESS_TOKEN;
const payGovNodeEnv = process.env.PAY_GOV_NODE_ENV || "local";

if (!token) {
  throw new Error(
    "Missing PAY_GOV_TEST_SERVER_ACCESS_TOKEN in environment (set it in .env).",
  );
}

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
    ACCESS_TOKEN: token,
    NODE_ENV: payGovNodeEnv,
  },
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
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  log.error("failed to spawn:", error);
  process.exit(1);
});
