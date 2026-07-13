import type { AppContext } from "@appTypes/AppContext";
import type {
  DeployHealthReport,
  HealthCheckResult,
} from "@schemas/DeployHealthReport.schema";
import { getParameterString } from "@clients/ssmClient";
import { probePayGovWsdl } from "../health/probePayGovWsdl";
import { getKnex } from "../db/knex";

async function timed(fn: () => Promise<void>): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  try {
    await fn();
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      status: "failed",
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Synthetic, read-only post-deploy health check. Exercises each infrastructure
// layer the payment flow depends on without creating any payment state.
export async function runDeployHealthCheck(
  appContext: AppContext,
): Promise<DeployHealthReport> {
  const [secrets, ssm, rds, payGov] = await Promise.all([
    timed(async () => {
      const agent = await appContext.getHttpsAgent();
      if (!agent) throw new Error("mTLS agent (Secrets Manager) not configured");
    }),
    timed(async () => {
      const name = process.env.MONITORING_SUBSCRIBERS_PARAMETER_NAME;
      if (!name) throw new Error("MONITORING_SUBSCRIBERS_PARAMETER_NAME not set");
      await getParameterString(name);
    }),
    timed(async () => {
      const knex = await getKnex();
      await knex.raw("SELECT 1");
    }),
    timed(async () => {
      const agent = await appContext.getHttpsAgent();
      const { ok } = await probePayGovWsdl(agent);
      if (!ok) throw new Error("Pay.gov WSDL probe returned non-2xx");
    }),
  ]);

  const checks = { secrets, ssm, rds, payGov };
  const healthy = Object.values(checks).every((c) => c.status === "ok");

  return {
    status: healthy ? "healthy" : "unhealthy",
    environment: process.env.APP_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
    checks,
  };
}
