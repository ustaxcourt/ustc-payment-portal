import { writeEmf } from "./emf";

// A spike here means something upstream broke — a bad redirect URL, a Pay.gov outage —
// not that more payers happened to wander off.
export function emitCancelSweepMetric(cancelledCount: number): void {
  writeEmf([{ Name: "TransactionsCancelled", Unit: "Count" }], {
    TransactionsCancelled: cancelledCount,
  });
}
