import { getAppEnv } from "../config/appEnv";

export const METRIC_NAMESPACE = "USTC/PaymentPortal";

export type EmfMetric = { Name: string; Unit: string };

/**
 * Best-effort CloudWatch EMF emitter. Writes a single embedded-metric log line to
 * stdout under the shared `USTC/PaymentPortal` namespace with an `Environment`
 * dimension. Telemetry must never break a request, so all failures are swallowed.
 *
 * @param metrics    Metric definitions (name + unit) declared on the EMF record.
 * @param values     Numeric datapoints, keyed by metric name.
 * @param properties Optional non-metric metadata (e.g. `Reason`) that rides along
 *                   on the log line for filtering but is not graphed as a metric.
 */
export function writeEmf(
  metrics: EmfMetric[],
  values: Record<string, number>,
  properties: Record<string, string> = {},
): void {
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
      ...properties,
      ...values,
    };

    process.stdout.write(`${JSON.stringify(emf)}\n`);
  } catch (err) {
    console.log("Failed to emit CloudWatch metric", err);
  }
}
