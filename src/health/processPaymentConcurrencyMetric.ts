import { writeEmf } from "./emf";

export type ProcessPaymentConflictReason =
  | "claim_in_progress"
  | "lock_not_available"
  | "deadlock"
  | "persist_race";

export function emitProcessPaymentConflictMetric(
  reason: ProcessPaymentConflictReason,
): void {
  writeEmf(
    [{ Name: "ProcessPaymentConflict", Unit: "Count" }],
    { ProcessPaymentConflict: 1 },
    { Reason: reason },
  );
}
