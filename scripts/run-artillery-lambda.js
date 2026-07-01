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
const lambdaCount = process.env.ARTILLERY_LAMBDA_COUNT || "1";
const awsRegion = process.env.ARTILLERY_LAMBDA_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

console.log(`Running artillery with target: ${target}, region: ${awsRegion}, lambda count: ${lambdaCount}, role ARN: ${roleArn}`);

const childEnv = { ...process.env };
delete childEnv.AWS_ACCESS_KEY_ID;
delete childEnv.AWS_SECRET_ACCESS_KEY;
delete childEnv.AWS_SESSION_TOKEN;
childEnv.AWS_REGION = awsRegion;
childEnv.AWS_DEFAULT_REGION = awsRegion;

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
    awsRegion,
    "--count",
    lambdaCount,
    "--lambda-role-arn",
    roleArn,
  ],
  { cwd: repoRoot, stdio: "inherit", env: childEnv },
);

process.exit(result.status ?? 1);
