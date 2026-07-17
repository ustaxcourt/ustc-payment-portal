import type { Frame, Page } from "@playwright/test";
import { getStagingE2EConfig, type StagingE2EConfig } from "./config";
import { FAILURE_CODES, StagingE2EError } from "./failureCodes";

type SearchContext = Frame | Page;

const listSearchContexts = (page: Page): SearchContext[] => {
  const frames = page.frames().filter((frame) => frame !== page.mainFrame());
  return [page, ...frames];
};

const waitForHostedPageReady = async (
  page: Page,
  timeoutMs: number,
): Promise<void> => {
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });

  const deadline = Date.now() + Math.min(timeoutMs, 10_000);

  while (Date.now() < deadline) {
    const cardMethodOption = page.getByRole("radio", {
      name: /debit or credit card/i,
    });
    const canChooseCardMethod =
      (await cardMethodOption.count()) > 0 &&
      (await cardMethodOption.isVisible().catch(() => false));

    if (canChooseCardMethod) {
      return;
    }

    const contexts = listSearchContexts(page);
    for (const context of contexts) {
      const candidate = context
        .getByLabel(/card number|security code|expiration|expiry/i)
        .first();

      if ((await candidate.count()) === 0) {
        continue;
      }

      const isVisible = await candidate.isVisible().catch(() => false);
      if (isVisible) {
        return;
      }
    }

    await page.waitForTimeout(250);
  }

  throw new StagingE2EError(
    FAILURE_CODES.PAYGOV_NAV_FAILED,
    "Pay.gov page loaded but neither the card form nor the payment-method selector became visible",
    { step: "paygov" },
  );
};

const hasLeftPayGov = (page: Page, payGovHost: string): boolean => {
  try {
    return new URL(page.url()).hostname.toLowerCase() !== payGovHost;
  } catch {
    return false;
  }
};

const waitForSuccessState = async (
  page: Page,
  timeoutMs: number,
): Promise<void> => {
  const config = getStagingE2EConfig();
  const redirectPromise = page.waitForURL(
    (url) => url.hostname.toLowerCase() !== config.payGovHost,
    { timeout: timeoutMs },
  );
  const confirmationPromise = page
    .getByText(/thank you|payment complete|confirmation|receipt|success/i)
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs });

  const outcomes = await Promise.allSettled([
    redirectPromise,
    confirmationPromise,
  ]);
  if (outcomes.every((outcome) => outcome.status === "rejected")) {
    throw new StagingE2EError(
      FAILURE_CODES.PAYGOV_SUBMIT_FAILED,
      "Pay.gov submit did not reach a success redirect or confirmation state",
      { step: "paygov" },
    );
  }
};

const parseExpiration = (raw: string): { month: string; year: string } => {
  const match = raw.trim().match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!match) {
    throw new StagingE2EError(
      FAILURE_CODES.PAYGOV_FORM_FAILED,
      `Unrecognized card expiration "${raw}"; expected MM/YY or MM/YYYY`,
      { step: "paygov" },
    );
  }

  const month = match[1].padStart(2, "0");
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return { month, year };
};

// For the US the field is a <select> of full state names; otherwise a text box.
const setStateOrProvince = async (
  page: Page,
  value: string,
  timeoutMs: number,
): Promise<void> => {
  const dropdown = page.getByRole("combobox", { name: /state\/province/i });
  if ((await dropdown.count()) > 0) {
    await dropdown.selectOption({ label: value });
    return;
  }

  const textbox = page.getByRole("textbox", { name: /state\/province/i });
  if ((await textbox.count()) > 0) {
    await textbox.fill(value, { timeout: timeoutMs });
  }
};

export const navigateToHostedPaymentPage = async (
  page: Page,
  paymentRedirect: string,
): Promise<void> => {
  const config = getStagingE2EConfig();

  try {
    await page.goto(paymentRedirect, {
      waitUntil: "domcontentloaded",
      timeout: config.timeouts.navigationMs,
    });
    await waitForHostedPageReady(page, config.timeouts.navigationMs);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load Pay.gov hosted page";
    throw new StagingE2EError(FAILURE_CODES.PAYGOV_NAV_FAILED, message, {
      step: "paygov",
    });
  }
};

// Pay.gov opens on a method-selection page; the card form renders only after
// choosing "Debit or credit card" and continuing. No-ops if already on the form.
const selectDebitOrCreditCard = async (page: Page): Promise<void> => {
  const config = getStagingE2EConfig();
  const cardOption = page.getByRole("radio", {
    name: /debit or credit card/i,
  });
  const cardOptionLabel = page.getByText(/debit or credit card/i).first();

  if ((await cardOption.count()) === 0) {
    return;
  }

  const canClickLabel =
    (await cardOptionLabel.count()) > 0 &&
    (await cardOptionLabel.isVisible().catch(() => false));

  if (canClickLabel) {
    await cardOptionLabel.click({ timeout: config.timeouts.navigationMs });
  } else {
    await cardOption.check({
      timeout: config.timeouts.navigationMs,
      force: true,
    });
  }

  const continueButton = page.getByRole("button", { name: /^continue$/i });
  await continueButton.click({ timeout: config.timeouts.navigationMs });
  await waitForHostedPageReady(page, config.timeouts.navigationMs);
};

const fillCardAndBillingForm = async (
  page: Page,
  config: StagingE2EConfig,
): Promise<void> => {
  const timeout = config.timeouts.navigationMs;

  await page
    .getByRole("textbox", { name: /cardholder name/i })
    .fill(config.card.cardholderName, { timeout });
  await page
    .getByRole("textbox", { name: /cardholder billing address/i })
    .fill(config.billing.address, { timeout });
  // Selecting United States re-renders City/State/Province as required.
  await page
    .getByRole("combobox", { name: /country/i })
    .selectOption({ label: config.billing.country });

  await page
    .getByRole("textbox", { name: /^\*?\s*city$/i })
    .fill(config.billing.city, { timeout });
  await setStateOrProvince(page, config.billing.state, timeout);
  await page
    .getByRole("textbox", { name: /zip\/postal code/i })
    .fill(config.billing.zip, { timeout });

  await page
    .getByRole("textbox", { name: /card number/i })
    .fill(config.card.pan, { timeout });

  const { month, year } = parseExpiration(config.card.expiration);
  await page
    .getByRole("combobox", { name: /select month/i })
    .selectOption({ label: month });
  await page
    .getByRole("combobox", { name: /select year/i })
    .selectOption({ label: year });

  await page
    .getByRole("textbox", { name: /security code/i })
    .fill(config.card.cvv, { timeout });
};

// Checks the review-page authorization box; hidden input, so fall back to the label.
const acceptAuthorizationIfPresent = async (
  page: Page,
  timeoutMs: number,
): Promise<void> => {
  const checkbox = page
    .getByRole("checkbox", {
      name: /authorize|agree|acknowledge|consent|terms/i,
    })
    .first();
  const checkboxLabel = page
    .getByText(/i authorize a charge|authorize|i agree|acknowledge/i)
    .first();

  if ((await checkbox.count()) === 0) {
    return;
  }

  if (await checkbox.isChecked().catch(() => false)) {
    return;
  }

  const shortTimeout = Math.min(timeoutMs, 5_000);
  const canClickLabel =
    (await checkboxLabel.count()) > 0 &&
    (await checkboxLabel.isVisible().catch(() => false));

  if (canClickLabel) {
    await checkboxLabel.click({ timeout: shortTimeout });
    return;
  }

  await checkbox.check({ timeout: shortTimeout, force: true });
};

// Card form → (review/authorization) → success redirect. Button label varies, so
// click the advancing button until we leave qa.pay.gov. Bounded to avoid loops.
const submitAndConfirm = async (
  page: Page,
  config: StagingE2EConfig,
): Promise<void> => {
  const maxAdvances = 4;

  for (let attempt = 0; attempt < maxAdvances; attempt += 1) {
    if (hasLeftPayGov(page, config.payGovHost)) {
      return;
    }

    await acceptAuthorizationIfPresent(page, config.timeouts.navigationMs);

    const advanceButton = page
      .getByRole("button", {
        name: /continue|submit payment|make payment|submit|confirm|authorize|pay now/i,
      })
      .first();

    if ((await advanceButton.count()) === 0) {
      break;
    }

    try {
      await advanceButton.click({ timeout: config.timeouts.navigationMs });
    } catch {
      break;
    }

    await page
      .waitForLoadState("domcontentloaded", {
        timeout: config.timeouts.navigationMs,
      })
      .catch(() => undefined);
  }

  await waitForSuccessState(page, config.timeouts.submitMs);
};

export const completeSuccessfulPlasticCard = async (
  page: Page,
): Promise<void> => {
  const config = getStagingE2EConfig();

  try {
    await selectDebitOrCreditCard(page);
    await fillCardAndBillingForm(page, config);
  } catch (error) {
    if (error instanceof StagingE2EError) {
      throw error;
    }

    throw new StagingE2EError(
      FAILURE_CODES.PAYGOV_FORM_FAILED,
      error instanceof Error
        ? error.message
        : "Failed to complete the Pay.gov payment form",
      { step: "paygov" },
    );
  }

  try {
    await submitAndConfirm(page, config);
  } catch (error) {
    if (error instanceof StagingE2EError) {
      throw error;
    }

    throw new StagingE2EError(
      FAILURE_CODES.PAYGOV_SUBMIT_FAILED,
      error instanceof Error
        ? error.message
        : "Failed to submit the Pay.gov payment form",
      { step: "paygov" },
    );
  }
};
