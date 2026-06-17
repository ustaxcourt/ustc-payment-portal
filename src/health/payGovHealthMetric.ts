import { getAppEnv } from "../config/appEnv";

const METRIC_NAMESPACE = "USTC/PaymentPortal";

/**
 * Publishes the Pay.gov health probe result as a CloudWatch metric using the
 * Embedded Metric Format (EMF) — a structured stdout line that CloudWatch
 * converts into metrics with no PutMetricData call and no extra IAM.
 *
 * Emits two metrics under namespace "USTC/PaymentPortal", dimensioned by
 * Environment:
 *   - PayGovHealthy   (1 = healthy, 0 = unhealthy)
 *   - PayGovLatencyMs (probe round-trip time)
 *
 * An alarm on PayGovHealthy is the durable "is Pay.gov healthy?" answer and the
 * source of the outage alert; dashboards read PayGovLatencyMs. See:
 * https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 */
export function emitPayGovHealthMetric(
  healthy: boolean,
  latencyMs: number,
): void {
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
}
