import { writeEmf } from "./emf";

export type InitPaymentConflictReason = "processing_in_flight" | "persist_race";

export function emitInitPaymentConflictMetric(
	reason: InitPaymentConflictReason,
): void {
	writeEmf(
		[{ Name: "InitPaymentConflict", Unit: "Count" }],
		{ InitPaymentConflict: 1 },
		{ Reason: reason },
	);
}
