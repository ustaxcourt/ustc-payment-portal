#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const IS_WINDOWS = process.platform === "win32";
const npmCommand = IS_WINDOWS ? "npm.cmd" : "npm";
const repoRoot = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    ...options,
  });

  if (result.status !== 0) {
    const details = [
      `Command failed: ${command} ${args.join(" ")}`,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    throw new Error(details);
  }

  return result;
}

function writeFakeNpm(fakeBinDir, logPath) {
  if (IS_WINDOWS) {
    const fakeNpmPath = path.join(fakeBinDir, "npm.cmd");
    const content = [
      "@echo off",
      `echo {\"cwd\":\"%cd:\\\\=\\\\\\\\%\",\"argv\":\"%*\"} > \"${logPath}\"`,
      "exit /b 0",
      "",
    ].join("\r\n");
    fs.writeFileSync(fakeNpmPath, content, "utf8");
    return;
  }

  const fakeNpmPath = path.join(fakeBinDir, "npm");
  const content = [
    "#!/usr/bin/env node",
    "const fs = require(\"node:fs\");",
    "const payload = { cwd: process.cwd(), argv: process.argv.slice(2) };",
    "fs.writeFileSync(process.env.FAKE_NPM_LOG, JSON.stringify(payload), \"utf8\");",
    "process.exit(0);",
    "",
  ].join("\n");

  fs.writeFileSync(fakeNpmPath, content, "utf8");
  fs.chmodSync(fakeNpmPath, 0o755);
}

function parsePackOutput(raw) {
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || !data[0]?.filename) {
    throw new Error("npm pack did not return expected json output");
  }

  return data[0].filename;
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "payment-portal-smoke-"));
  const consumerRoot = path.join(tempRoot, "consumer");
  const fakeBinDir = path.join(tempRoot, "fake-bin");
  const fakeNpmLog = path.join(tempRoot, "fake-npm-log.json");

  fs.mkdirSync(consumerRoot, { recursive: true });
  fs.mkdirSync(fakeBinDir, { recursive: true });

  try {
    // Ensure dist artifacts are freshly built before packaging.
    run(npmCommand, ["run", "prepack"], {
      cwd: repoRoot,
    });

    const pack = run(npmCommand, ["pack", "--json", "--ignore-scripts"], {
      cwd: repoRoot,
    });
    const tarballFilename = parsePackOutput(pack.stdout);
    const tarballPath = path.join(repoRoot, tarballFilename);

    run(npmCommand, ["init", "-y"], { cwd: consumerRoot });
    run(npmCommand, ["install", tarballPath], { cwd: consumerRoot });

    const packageRoot = path.join(
      consumerRoot,
      "node_modules",
      "@ustaxcourt",
      "payment-portal",
    );

    const resolutionCheck = [
      "require.resolve(\"dotenv\");",
      "require.resolve(\"express\");",
      "require.resolve(\"npm-run-all\");",
      "require.resolve(\"pino-pretty\");",
    ].join(" ");

    run(process.execPath, ["-e", resolutionCheck], { cwd: packageRoot });

    writeFakeNpm(fakeBinDir, fakeNpmLog);

    const cliPath = path.join(packageRoot, "bin", "payment-portal.js");
    run(process.execPath, [cliPath], {
      cwd: consumerRoot,
      env: {
        ...process.env,
        FAKE_NPM_LOG: fakeNpmLog,
        PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ""}`,
      },
    });

    if (!fs.existsSync(fakeNpmLog)) {
      throw new Error("CLI smoke test did not invoke npm");
    }

    const invocation = JSON.parse(fs.readFileSync(fakeNpmLog, "utf8"));
    const expectedCwd = fs.realpathSync(packageRoot);
    const actualCwd = fs.realpathSync(invocation.cwd);

    if (actualCwd !== expectedCwd) {
      throw new Error(
        `CLI spawned npm from unexpected cwd. expected=${expectedCwd} actual=${actualCwd}`,
      );
    }

    if (IS_WINDOWS) {
      if (!String(invocation.argv).includes("run start:all")) {
        throw new Error(`CLI spawned npm with unexpected args: ${invocation.argv}`);
      }
    } else {
      const expectedArgs = ["run", "start:all"];
      if (JSON.stringify(invocation.argv) !== JSON.stringify(expectedArgs)) {
        throw new Error(
          `CLI spawned npm with unexpected args: ${JSON.stringify(invocation.argv)}`,
        );
      }
    }

    console.log("Consumer install smoke test passed.");
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures in smoke test.
    }
  }
}

main();
