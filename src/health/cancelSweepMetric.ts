import { writeEmf } from "./emf";

// A spike means something upstream broke, not that more payers wandered off.
export function emitCancelSweepMetric(cancelledCount: number): void {
  writeEmf([{ Name: "TransactionsCancelled", Unit: "Count" }], {
    TransactionsCancelled: cancelledCount,
  });
}
