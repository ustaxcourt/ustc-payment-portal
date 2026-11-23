import { writeEmf } from "./emf";

export function emitPaymentOutcomeUnknownMetric(count: number): void {
  writeEmf(
    [{ Name: "PaymentOutcomeUnknown", Unit: "Count" }],
    { PaymentOutcomeUnknown: count },
  );
}
