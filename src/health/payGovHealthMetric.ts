import { writeEmf } from "./emf";

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
