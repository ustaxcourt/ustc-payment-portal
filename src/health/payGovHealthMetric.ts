import { getAppEnv } from "../config/appEnv";

const METRIC_NAMESPACE = "USTC/PaymentPortal";

type EmfMetric = { Name: string; Unit: string };

function writeEmf(metrics: EmfMetric[], values: Record<string, number>): void {
  try {
    const emf = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: METRIC_NAMESPACE,
            Dimensions: [["Environment"]],
            Metrics: metrics,
          },
        ],
      },
      Environment: getAppEnv(),
      ...values,
    };

    process.stdout.write(`${JSON.stringify(emf)}\n`);
  } catch (err) {
    console.log("Failed to emit Pay.gov CloudWatch metric", err);
  }
}


export function emitPayGovHealthMetric(
  healthy: boolean,
  latencyMs: number,
): void {
  writeEmf(
    [
      { Name: "PayGovHealthy", Unit: "Count" },
      { Name: "PayGovLatencyMs", Unit: "Milliseconds" },
    ],
    {
      PayGovHealthy: healthy ? 1 : 0,
      PayGovLatencyMs: latencyMs,
    },
  );
}

export function emitPayGovErrorMetric(): void {
  writeEmf([{ Name: "PayGovError", Unit: "Count" }], { PayGovError: 1 });
}
