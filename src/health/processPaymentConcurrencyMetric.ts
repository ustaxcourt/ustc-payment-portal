import { getAppEnv } from "../config/appEnv";

const METRIC_NAMESPACE = "USTC/PaymentPortal";

export type ProcessPaymentConflictReason =
  | "claim_in_progress"
  | "lock_not_available"
  | "deadlock"
  | "persist_race";

export function emitProcessPaymentConflictMetric(
  reason: ProcessPaymentConflictReason,
): void {
  try {
    const emf = {
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: METRIC_NAMESPACE,
            Dimensions: [["Environment"]],
            Metrics: [{ Name: "ProcessPaymentConflict", Unit: "Count" }],
          },
        ],
      },
      Environment: getAppEnv(),
      Reason: reason,
      ProcessPaymentConflict: 1,
    };

    process.stdout.write(`${JSON.stringify(emf)}\n`);
  } catch (err) {
    console.log("Failed to emit process payment conflict metric", err);
  }
}
