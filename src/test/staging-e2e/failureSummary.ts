import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { FailureCode, StagingE2EStep } from "./failureCodes";

export type FailureSummary = {
  baseUrl?: string;
  code: FailureCode;
  httpStatus?: number;
  message: string;
  step: StagingE2EStep;
  timestamp: string;
  transactionReferenceId?: string;
};

export const FAILURE_SUMMARY_PATH = path.resolve(
  process.cwd(),
  "failure-summary.json",
);

export const writeFailureSummary = async (
  summary: Omit<FailureSummary, "timestamp">,
): Promise<void> => {
  await writeFile(
    FAILURE_SUMMARY_PATH,
    JSON.stringify(
      {
        ...summary,
        timestamp: new Date().toISOString(),
      } satisfies FailureSummary,
      null,
      2,
    ),
    "utf8",
  );
};
