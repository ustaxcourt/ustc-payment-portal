import { expect, test } from "@playwright/test";
import { getStagingE2EConfig } from "./config";
import { writeFailureSummary } from "./failureSummary";
import {
  FAILURE_CODES,
  logFailureCode,
  logStep,
  toStagingE2EError,
  type StagingE2EStep,
} from "./failureCodes";
import {
  completeSuccessfulPlasticCard,
  navigateToHostedPaymentPage,
} from "./paygovForm";
import {
  getDetails,
  initNonAttorneyPayment,
  processPayment,
} from "./portalApi";

test("Credit Card - Success", async ({ page }) => {
  let step: StagingE2EStep = "config";
  let baseUrl: string | undefined;
  let token: string | undefined;
  let transactionReferenceId: string | undefined;

  try {
    const config = getStagingE2EConfig();
    baseUrl = config.baseUrl;

    step = "init";
    logStep("init");
    const initialized = await initNonAttorneyPayment();
    token = initialized.token;
    transactionReferenceId = initialized.transactionReferenceId;

    expect(new URL(initialized.paymentRedirect).hostname).toBe(
      config.payGovHost,
    );

    step = "paygov";
    logStep("paygov");
    await navigateToHostedPaymentPage(page, initialized.paymentRedirect);
    await completeSuccessfulPlasticCard(page);

    step = "process";
    logStep("process");
    const processResult = await processPayment(initialized.token);
    expect(processResult.paymentStatus).toBe("success");

    step = "details";
    logStep("details");
    const details = await getDetails(initialized.transactionReferenceId);
    expect(details.paymentStatus).toBe("success");
    expect(details.transactions.at(-1)?.transactionStatus).toBe("processed");

    step = "done";
    logStep("done");
  } catch (error) {
    const normalized = toStagingE2EError(error, {
      code: FAILURE_CODES.UNEXPECTED,
      message: "Unexpected staging Pay.gov E2E failure",
      step,
      token,
      transactionReferenceId,
    });

    logFailureCode(normalized.code, {
      step: normalized.step ?? step,
      transactionReferenceId:
        normalized.transactionReferenceId ?? transactionReferenceId,
      token: normalized.token ?? token,
      httpStatus: normalized.httpStatus,
      message: normalized.message,
    });

    await writeFailureSummary({
      code: normalized.code,
      step: normalized.step ?? step,
      transactionReferenceId:
        normalized.transactionReferenceId ?? transactionReferenceId,
      httpStatus: normalized.httpStatus,
      message: normalized.message,
      baseUrl,
    });

    throw normalized;
  }
});
