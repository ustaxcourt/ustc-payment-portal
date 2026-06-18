import { getAppEnv } from "../config/appEnv";

const METRIC_NAMESPACE = "USTC/PaymentPortal";

export function emitPayGovHealthMetric(
  healthy: boolean,
  latencyMs: number,
): void {
  try {
    const emf = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: METRIC_NAMESPACE,
            Dimensions: [["Environment"]],
            Metrics: [
              { Name: "PayGovHealthy", Unit: "Count" },
              { Name: "PayGovLatencyMs", Unit: "Milliseconds" },
            ],
          },
        ],
      },
      Environment: getAppEnv(),
      PayGovHealthy: healthy ? 1 : 0,
      PayGovLatencyMs: latencyMs,
    };

    process.stdout.write(`${JSON.stringify(emf)}\n`);
  } catch (err) {
    console.log("Failed to emit Pay.gov health metric", err);
  }
}
