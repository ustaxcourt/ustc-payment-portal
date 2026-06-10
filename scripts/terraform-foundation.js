#!/usr/bin/env node

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const VALID_ACTIONS = new Set(["init", "plan", "apply"]);
const VALID_ENVS = new Set(["dev", "stg", "prod"]);

const ENV_CONFIG = {
  dev: {
    profile: "ustcpp-dev",
    expectedAccountId: process.env.USTCPP_DEV_ACCOUNT_ID || "723609007960",
    backendConfig: "backend/dev.hcl",
    varFile: "vars/dev.vars.hcl",
  },
  stg: {
    profile: "ustcpp-stg",
    expectedAccountId: "747103385969",
    backendConfig: "backend/stg.hcl",
    varFile: "vars/stg.vars.hcl",
  },
  prod: {
    profile: "ustcpp-prod",
    expectedAccountId: "802939326821",
    backendConfig: "backend/prod.hcl",
    varFile: "vars/prod.vars.hcl",
  },
};

function parseArgs(argv) {
  const action = argv[2];
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(
      `Invalid action '${action ?? ""}'. Expected one of: init, plan, apply.`,
    );
  }

  const passthrough = [];
  let env = "";

  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg.startsWith("--env=")) {
      env = arg.slice("--env=".length);
      continue;
    }

    if (arg === "--env") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --env. Expected dev, stg, or prod.");
      }
      env = value;
      index += 1;
      continue;
    }

    passthrough.push(arg);
  }

  if (!VALID_ENVS.has(env)) {
    throw new Error(
      `Invalid or missing --env value '${env}'. Expected one of: dev, stg, prod.`,
    );
  }

  return { action, env, passthrough };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  return 1;
}

function runAndCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  return result;
}

function ensureSsoSession(profile) {
  const check = runAndCapture(
    "aws",
    ["sts", "get-caller-identity", "--profile", profile, "--output", "json"],
    {
      env: {
        ...process.env,
        AWS_PROFILE: profile,
        AWS_SDK_LOAD_CONFIG: "1",
      },
    },
  );

  if (check.status === 0) {
    return check.stdout;
  }

  const loginCode = run(
    "aws",
    ["sso", "login", "--profile", profile],
    {
      env: {
        ...process.env,
        AWS_PROFILE: profile,
        AWS_SDK_LOAD_CONFIG: "1",
      },
    },
  );

  if (loginCode !== 0) {
    throw new Error(`Failed AWS SSO login for profile '${profile}'.`);
  }

  const recheck = runAndCapture(
    "aws",
    ["sts", "get-caller-identity", "--profile", profile, "--output", "json"],
    {
      env: {
        ...process.env,
        AWS_PROFILE: profile,
        AWS_SDK_LOAD_CONFIG: "1",
      },
    },
  );

  if (recheck.status !== 0) {
    throw new Error(
      `Unable to verify AWS caller identity for profile '${profile}' after SSO login.`,
    );
  }

  return recheck.stdout;
}

function verifyAccountId(identityJson, expectedAccountId, envName) {
  const identity = JSON.parse(identityJson);
  const currentAccountId = identity.Account;

  if (!expectedAccountId) {
    console.warn(
      `[tf:foundation] Skipping account-id enforcement for ${envName}. Set USTCPP_${envName.toUpperCase()}_ACCOUNT_ID to enforce.`,
    );
    return;
  }

  if (currentAccountId !== expectedAccountId) {
    throw new Error(
      `AWS account mismatch for ${envName}. Expected '${expectedAccountId}', got '${currentAccountId}'.`,
    );
  }
}

function buildTerraformArgs(action, envConfig, passthrough) {
  if (action === "init") {
    return [
      "init",
      "-reconfigure",
      `-backend-config=${envConfig.backendConfig}`,
      ...passthrough,
    ];
  }

  return [action, `-var-file=${envConfig.varFile}`, ...passthrough];
}

function main() {
  const { action, env, passthrough } = parseArgs(process.argv);
  const envConfig = ENV_CONFIG[env];

  const foundationDir = path.resolve(
    __dirname,
    "..",
    "terraform",
    "environments",
    "foundation",
  );

  const profile = envConfig.profile;

  console.log(
    `[tf:foundation] action=${action} env=${env} profile=${profile} cwd=${foundationDir}`,
  );

  const identityJson = ensureSsoSession(profile);
  verifyAccountId(identityJson, envConfig.expectedAccountId, env);

  const terraformArgs = buildTerraformArgs(action, envConfig, passthrough);

  const exitCode = run("terraform", terraformArgs, {
    cwd: foundationDir,
    env: {
      ...process.env,
      AWS_PROFILE: profile,
      AWS_SDK_LOAD_CONFIG: "1",
    },
  });

  return exitCode;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[tf:foundation] ${message}`);
    process.exit(1);
  }
}

module.exports = {
  ENV_CONFIG,
  buildTerraformArgs,
  ensureSsoSession,
  main,
  parseArgs,
  verifyAccountId,
};
