import type { AppContext } from "@appTypes/AppContext";
import { getPayGovAuthHeaders } from "@clients/payGovAuthHeaders";
import { getParameterString } from "@clients/ssmClient";
import type {
  DeployHealthReport,
  HealthCheckResult,
} from "@schemas/DeployHealthReport.schema";
import { getAppEnv } from "../config/appEnv";
import { getKnex } from "../db/knex";
import { probePayGovWsdl } from "../health/probePayGovWsdl";

const MTLS_OPTIONAL_ENVS = new Set(["dev", "local"]);

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
  // mTLS is only configured for environments that call the real Pay.gov (stg/prod).
  // Dev's SOAP_URL points at the mock ustc-pay-gov-test-server, which authenticates
  // via PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID instead - see getPayGovAuthHeaders.
  const mtlsConfigured = Boolean(
    process.env.PRIVATE_KEY_SECRET_ID && process.env.CERTIFICATE_SECRET_ID,
  );

  const [secrets, ssm, rds, payGov] = await Promise.all([
    timed(async () => {
      if (!mtlsConfigured) {
        if (!MTLS_OPTIONAL_ENVS.has(getAppEnv())) {
          throw new Error("mTLS agent (Secrets Manager) not configured");
        }
        if (!process.env.PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID) {
          throw new Error("PAY_GOV_DEV_SERVER_TOKEN_SECRET_ID not set");
        }
        return;
      }
      const agent = await appContext.getHttpsAgent();
      if (!agent)
        throw new Error("mTLS agent (Secrets Manager) not configured");
    }).then((result) =>
      result.status === "ok"
        ? {
            ...result,
            details: mtlsConfigured
              ? {
                  privateKey: true,
                  certificate: true,
                  passphraseConfigured: Boolean(
                    process.env.CERT_PASSPHRASE_SECRET_ID,
                  ),
                }
              : { mtlsEnabled: false },
          }
        : result,
    ),
    timed(async () => {
      const name = process.env.MONITORING_SUBSCRIBERS_PARAMETER_NAME;
      if (!name)
        throw new Error("MONITORING_SUBSCRIBERS_PARAMETER_NAME not set");
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
      const headers = await getPayGovAuthHeaders(appContext.logger);
      const { ok } = await probePayGovWsdl(agent, headers);
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
