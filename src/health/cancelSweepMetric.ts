import { writeEmf } from "./emf";

export function emitCancelSweepMetric(cancelledCount: number): void {
  writeEmf([{ Name: "TransactionsCancelled", Unit: "Count" }], {
    TransactionsCancelled: cancelledCount,
  });
}
