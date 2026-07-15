import type { Frame, Locator, Page } from "@playwright/test";
import { getStagingE2EConfig } from "./config";
import { FAILURE_CODES, StagingE2EError } from "./failureCodes";

type SearchContext = Frame | Page;
type LocatorFactory = (context: SearchContext) => Locator;

const fieldCandidates = {
  cardholderName: [
    (context: SearchContext) =>
      context.getByLabel(/name on card|cardholder name|name/i),
    (context: SearchContext) =>
      context.getByPlaceholder(/name on card|cardholder name|name/i),
    (context: SearchContext) =>
      context.locator('input[autocomplete="cc-name"]'),
    (context: SearchContext) => context.locator('input[name*="name" i]'),
  ],
  cardNumber: [
    (context: SearchContext) =>
      context.getByLabel(/card number|account number/i),
    (context: SearchContext) =>
      context.getByPlaceholder(/card number|account number/i),
    (context: SearchContext) =>
      context.locator('input[autocomplete="cc-number"]'),
    (context: SearchContext) =>
      context.locator('input[name*="card" i][name*="number" i]'),
    (context: SearchContext) => context.locator('input[inputmode="numeric"]'),
  ],
  cvv: [
    (context: SearchContext) =>
      context.getByLabel(/cvv|cvc|security code|card code/i),
    (context: SearchContext) =>
      context.getByPlaceholder(/cvv|cvc|security code|card code/i),
    (context: SearchContext) => context.locator('input[autocomplete="cc-csc"]'),
    (context: SearchContext) =>
      context.locator('input[name*="cvv" i], input[name*="cvc" i]'),
  ],
  expiration: [
    (context: SearchContext) =>
      context.getByLabel(/expiration|expiry|exp date/i),
    (context: SearchContext) =>
      context.getByPlaceholder(/mm\/?yy|expiration|expiry|exp date/i),
    (context: SearchContext) => context.locator('input[autocomplete="cc-exp"]'),
    (context: SearchContext) => context.locator('input[name*="exp" i]'),
  ],
  submit: [
    (context: SearchContext) =>
      context.getByRole("button", { name: /submit|pay|continue|review|next/i }),
    (context: SearchContext) =>
      context.locator('button[type="submit"], input[type="submit"]'),
  ],
};

const listSearchContexts = (page: Page): SearchContext[] => {
  const frames = page.frames().filter((frame) => frame !== page.mainFrame());
  return [page, ...frames];
};

const resolveLocator = async (
  page: Page,
  candidates: LocatorFactory[],
  timeoutMs: number,
): Promise<Locator> => {
  const contexts = listSearchContexts(page);

  for (const context of contexts) {
    for (const candidate of candidates) {
      const locator = candidate(context).first();

      try {
        if ((await locator.count()) === 0) {
          continue;
        }

        await locator.waitFor({
          state: "visible",
          timeout: Math.min(timeoutMs, 2_500),
        });
        return locator;
      } catch {
        continue;
      }
    }
  }

  throw new StagingE2EError(
    FAILURE_CODES.PAYGOV_FORM_FAILED,
    "Could not locate a visible Pay.gov payment form field",
    { step: "paygov" },
  );
};

const tryResolveLocator = async (
  page: Page,
  candidates: LocatorFactory[],
  timeoutMs: number,
): Promise<Locator | undefined> => {
  try {
    return await resolveLocator(page, candidates, timeoutMs);
  } catch {
    return undefined;
  }
};

const waitForHostedPageReady = async (
  page: Page,
  timeoutMs: number,
): Promise<void> => {
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });

  const contexts = listSearchContexts(page);
  for (const context of contexts) {
    const candidate = context
      .getByText(/card number|security code|expiration|expiry/i)
      .first();
    try {
      await candidate.waitFor({ state: "visible", timeout: 1_500 });
      return;
    } catch {
      continue;
    }
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

export const completeSuccessfulPlasticCard = async (
  page: Page,
): Promise<void> => {
  const config = getStagingE2EConfig();

  try {
    const cardNumber = await resolveLocator(
      page,
      fieldCandidates.cardNumber,
      config.timeouts.navigationMs,
    );
    const expiration = await resolveLocator(
      page,
      fieldCandidates.expiration,
      config.timeouts.navigationMs,
    );
    const cvv = await resolveLocator(
      page,
      fieldCandidates.cvv,
      config.timeouts.navigationMs,
    );
    const nameField = config.card.cardholderName
      ? await tryResolveLocator(
          page,
          fieldCandidates.cardholderName,
          config.timeouts.navigationMs,
        )
      : undefined;

    await cardNumber.fill(config.card.pan);
    await expiration.fill(config.card.expiration);
    await cvv.fill(config.card.cvv);

    if (nameField && config.card.cardholderName) {
      await nameField.fill(config.card.cardholderName);
    }
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
    const submit = await resolveLocator(
      page,
      fieldCandidates.submit,
      config.timeouts.navigationMs,
    );
    await submit.click();
    await waitForSuccessState(page, config.timeouts.submitMs);
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
