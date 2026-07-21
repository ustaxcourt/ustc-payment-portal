import type { AppContext } from "@appTypes/AppContext";
import { getParameterString } from "@clients/ssmClient";
import type {
  DeployHealthReport,
  HealthCheckResult,
} from "@schemas/DeployHealthReport.schema";
import { getKnex } from "../db/knex";
import { probePayGovWsdl } from "../health/probePayGovWsdl";

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

export async function runDeployHealthCheck(
  appContext: AppContext,
  releaseTag?: string,
): Promise<DeployHealthReport> {
  const [secrets, ssm, rds, payGov] = await Promise.all([
    timed(async () => {
      const agent = await appContext.getHttpsAgent();
      if (!agent) throw new Error("mTLS agent (Secrets Manager) not configured");
    }).then((result) =>
      result.status === "ok"
        ? {
            ...result,
            details: {
              privateKey: true,
              certificate: true,
              passphraseConfigured: Boolean(
                process.env.CERT_PASSPHRASE_SECRET_ID,
              ),
            },
          }
        : result,
    ),
    timed(async () => {
      const name = process.env.MONITORING_SUBSCRIBERS_PARAMETER_NAME;
      if (!name) throw new Error("MONITORING_SUBSCRIBERS_PARAMETER_NAME not set");
      const raw = await getParameterString(name);
      if (!Array.isArray(JSON.parse(raw))) {
        throw new Error("monitoring-subscribers parameter is not a JSON array");
      }
    }),
    timed(async () => {
      const knex = await getKnex();
      await knex.raw("SELECT 1 FROM transactions LIMIT 1");
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
    ...(releaseTag ? { releaseTag } : {}),
    checks,
  };
}
