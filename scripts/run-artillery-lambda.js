const { spawnSync } = require("node:child_process");
const path = require("node:path");
const dotenv = require("dotenv");

const repoRoot = path.join(__dirname, "..");
dotenv.config({
  path: path.join(repoRoot, "artillery", ".env"),
  override: true,
});

const roleArn = process.env.ARTILLERY_LAMBDA_ROLE_ARN?.trim();
if (!roleArn) {
  console.error("ARTILLERY_LAMBDA_ROLE_ARN is not set in artillery/.env");
  process.exit(1);
}

const target =
  process.env.ARTILLERY_TARGET || "https://dev-payments.ustaxcourt.gov";

const childEnv = { ...process.env };
delete childEnv.AWS_ACCESS_KEY_ID;
delete childEnv.AWS_SECRET_ACCESS_KEY;
delete childEnv.AWS_SESSION_TOKEN;
childEnv.AWS_REGION = "us-east-1";
childEnv.AWS_DEFAULT_REGION = "us-east-1";

const result = spawnSync(
  "artillery",
  [
    "run-lambda",
    ...process.argv.slice(2),
    "--dotenv",
    "artillery/.env",
    "--target",
    target,
    "--region",
    "us-east-1",
    "--count",
    "1",
    "--lambda-role-arn",
    roleArn,
  ],
  { cwd: repoRoot, stdio: "inherit", env: childEnv },
);

process.exit(result.status ?? 1);
