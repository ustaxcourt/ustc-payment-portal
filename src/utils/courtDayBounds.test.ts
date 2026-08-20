import { courtDayBounds, courtPeriodBounds } from "./courtDayBounds";

const hoursBetween = (start: Date, end: Date): number =>
  (end.getTime() - start.getTime()) / 3_600_000;

describe("courtDayBounds", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("throws when a date part is missing rather than scoping to nothing", () => {
    jest.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () =>
        ({
          formatToParts: () => [{ type: "year", value: "2026" }],
        } as unknown as Intl.DateTimeFormat),
    );

    expect(() => courtDayBounds(new Date("2026-08-03T15:00:00.000Z"))).toThrow(
      "No month in America/New_York date parts",
    );
  });

  it("brackets a summer day at EDT midnight (UTC-4)", () => {
    const { start, end } = courtDayBounds(new Date("2026-08-03T15:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-08-03T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-04T04:00:00.000Z");
  });

  it("brackets a winter day at EST midnight (UTC-5)", () => {
    const { start, end } = courtDayBounds(new Date("2026-01-15T15:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-16T05:00:00.000Z");
  });

  it("keeps a late Court evening on its own day, not UTC's next day", () => {
    // 2026-08-03 23:30 in New York is already 2026-08-04 in UTC.
    const { start, end } = courtDayBounds(new Date("2026-08-04T03:30:00.000Z"));

    expect(start.toISOString()).toBe("2026-08-03T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-04T04:00:00.000Z");
  });

  it("keeps an early Court morning on its own day", () => {
    // 2026-08-03 00:30 in New York.
    const { start, end } = courtDayBounds(new Date("2026-08-03T04:30:00.000Z"));

    expect(start.toISOString()).toBe("2026-08-03T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-04T04:00:00.000Z");
  });

  it("spans 23 hours on the spring-forward day", () => {
    const { start, end } = courtDayBounds(new Date("2026-03-08T15:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(hoursBetween(start, end)).toBe(23);
  });

  it("spans 25 hours on the fall-back day", () => {
    const { start, end } = courtDayBounds(new Date("2026-11-01T15:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(hoursBetween(start, end)).toBe(25);
  });

  it("rolls across a month boundary", () => {
    const { start, end } = courtDayBounds(new Date("2026-08-31T15:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-08-31T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });

  it("rolls across a year boundary", () => {
    const { start, end } = courtDayBounds(new Date("2026-12-31T15:00:00.000Z"));

    expect(start.toISOString()).toBe("2026-12-31T05:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("courtPeriodBounds", () => {
  // Monday 2026-08-17, 11:00 EDT.
  const MONDAY = new Date("2026-08-17T15:00:00.000Z");

  it("opens every period at Court-local midnight", () => {
    const periods = courtPeriodBounds(MONDAY);

    expect(periods.day.start.toISOString()).toBe("2026-08-17T04:00:00.000Z");
    expect(periods.week.start.toISOString()).toBe("2026-08-16T04:00:00.000Z");
    expect(periods.month.start.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(periods.quarter.start.toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(periods.fiscalYear.start.toISOString()).toBe(
      "2025-10-01T04:00:00.000Z",
    );
  });

  it("closes every period at now, not at its calendar end", () => {
    const periods = courtPeriodBounds(MONDAY);

    for (const period of Object.values(periods)) {
      expect(period.end.toISOString()).toBe("2026-08-17T15:00:00.000Z");
    }
  });

  describe("week", () => {
    it("opens on the most recent Sunday", () => {
      const { week } = courtPeriodBounds(MONDAY);

      expect(week.start.toISOString()).toBe("2026-08-16T04:00:00.000Z");
    });

    it("opens today when today is Sunday", () => {
      // Sunday 2026-08-16.
      const { day, week } = courtPeriodBounds(
        new Date("2026-08-16T15:00:00.000Z"),
      );

      expect(week.start.toISOString()).toBe(day.start.toISOString());
    });

    it("reaches back into the previous month", () => {
      // Tuesday 2026-09-01 — the week opened on Sunday 2026-08-30.
      const { week } = courtPeriodBounds(new Date("2026-09-01T15:00:00.000Z"));

      expect(week.start.toISOString()).toBe("2026-08-30T04:00:00.000Z");
    });

    it("reaches back into the previous year", () => {
      // Friday 2027-01-01 — the week opened on Sunday 2026-12-27, in EST.
      const { week } = courtPeriodBounds(new Date("2027-01-01T15:00:00.000Z"));

      expect(week.start.toISOString()).toBe("2026-12-27T05:00:00.000Z");
    });
  });

  describe("fiscal quarter", () => {
    it.each([
      ["October, the first month of fiscal Q1", "2026-10-01", "2026-10-01T04"],
      ["December, the last month of fiscal Q1", "2026-12-15", "2026-10-01T04"],
      ["January, the first month of fiscal Q2", "2026-01-15", "2026-01-01T05"],
      ["August, the second month of fiscal Q4", "2026-08-17", "2026-07-01T04"],
    ])("opens on the quarter containing %s", (_label, now, expected) => {
      const { quarter } = courtPeriodBounds(new Date(`${now}T15:00:00.000Z`));

      expect(quarter.start.toISOString()).toBe(`${expected}:00:00.000Z`);
    });
  });

  describe("fiscal year", () => {
    it("stays in the previous calendar year through September", () => {
      const { fiscalYear } = courtPeriodBounds(
        new Date("2026-09-30T15:00:00.000Z"),
      );

      expect(fiscalYear.start.toISOString()).toBe("2025-10-01T04:00:00.000Z");
    });

    it("rolls over on October 1", () => {
      const { fiscalYear } = courtPeriodBounds(
        new Date("2026-10-01T15:00:00.000Z"),
      );

      expect(fiscalYear.start.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    });
  });

  describe("daylight saving", () => {
    it("opens the day at EST midnight on the spring-forward day", () => {
      // Sunday 2026-03-08 — the clocks go forward at 02:00, after midnight.
      const { day, week } = courtPeriodBounds(
        new Date("2026-03-08T15:00:00.000Z"),
      );

      expect(day.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
      expect(week.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    });

    it("opens each period at its own offset when a period spans a change", () => {
      // From January (EST) the fiscal year opened in October (EDT).
      const { day, fiscalYear } = courtPeriodBounds(
        new Date("2026-01-15T15:00:00.000Z"),
      );

      expect(day.start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
      expect(fiscalYear.start.toISOString()).toBe("2025-10-01T04:00:00.000Z");
    });
  });
});
