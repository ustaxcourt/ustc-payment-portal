import { mapCourtPeriods } from "@utils/courtDayBounds";
import {
  RevenueSummaryQuerySchema,
  RevenueSummaryResponseSchema,
} from "./RevenueSummary.schema";

const period = () => ({
  from: "2026-08-01T04:00:00.000Z",
  to: "2026-08-18T14:30:00.000Z",
  total: 560,
  fees: [
    {
      fee: "PETITION_FILING_FEE",
      feeName: "Petition Filing Fee",
      qty: 1,
      subtotal: 60,
    },
  ],
});

const trend = () => ({
  current: 560,
  previous: 480,
  difference: 80,
  percentChange: 16.67,
});

const response = () => ({
  totals: mapCourtPeriods(period),
  yoyTrends: mapCourtPeriods(trend),
});

describe("RevenueSummaryResponseSchema", () => {
  it("accepts a complete summary", () => {
    expect(RevenueSummaryResponseSchema.safeParse(response()).success).toBe(
      true,
    );
  });

  it("requires fees on every period", () => {
    const body = response();
    // @ts-expect-error exercising the runtime guard
    body.totals.day.fees = undefined;

    expect(RevenueSummaryResponseSchema.safeParse(body).success).toBe(false);
  });

  it("requires every period, not a subset", () => {
    const body = response();
    // @ts-expect-error exercising the runtime guard
    body.totals.fiscalYear = undefined;

    expect(RevenueSummaryResponseSchema.safeParse(body).success).toBe(false);
  });

  it("tolerates absent trends, so totals survive a failed prior-year query", () => {
    const { totals } = response();

    expect(RevenueSummaryResponseSchema.safeParse({ totals }).success).toBe(
      true,
    );
  });
});

describe("RevenueSummaryQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(RevenueSummaryQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects any parameter — flags are a different view's problem", () => {
    expect(
      RevenueSummaryQuerySchema.safeParse({ includeAnything: "true" }).success,
    ).toBe(false);
  });
});
