import { courtDayBounds, courtWindowBounds } from "./courtDayBounds";

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
        }) as unknown as Intl.DateTimeFormat,
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

describe("courtWindowBounds", () => {
  // Monday 2026-08-17, 11:00 EDT.
  const MONDAY = new Date("2026-08-17T15:00:00.000Z");

  it("opens every window at Court-local midnight", () => {
    const windows = courtWindowBounds(MONDAY);

    expect(windows.day.start.toISOString()).toBe("2026-08-17T04:00:00.000Z");
    expect(windows.week.start.toISOString()).toBe("2026-08-16T04:00:00.000Z");
    expect(windows.month.start.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(windows.quarter.start.toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(windows.fiscalYear.start.toISOString()).toBe(
      "2025-10-01T04:00:00.000Z",
    );
  });

  it("closes every window at now, not at the end of the period", () => {
    const windows = courtWindowBounds(MONDAY);

    for (const window of Object.values(windows)) {
      expect(window.end.toISOString()).toBe("2026-08-17T15:00:00.000Z");
    }
  });

  describe("week", () => {
    it("opens on the most recent Sunday", () => {
      const { week } = courtWindowBounds(MONDAY);

      expect(week.start.toISOString()).toBe("2026-08-16T04:00:00.000Z");
    });

    it("opens today when today is Sunday", () => {
      // Sunday 2026-08-16.
      const { day, week } = courtWindowBounds(
        new Date("2026-08-16T15:00:00.000Z"),
      );

      expect(week.start.toISOString()).toBe(day.start.toISOString());
    });

    it("reaches back into the previous month", () => {
      // Tuesday 2026-09-01 — the week opened on Sunday 2026-08-30.
      const { week } = courtWindowBounds(new Date("2026-09-01T15:00:00.000Z"));

      expect(week.start.toISOString()).toBe("2026-08-30T04:00:00.000Z");
    });

    it("reaches back into the previous year", () => {
      // Friday 2027-01-01 — the week opened on Sunday 2026-12-27, in EST.
      const { week } = courtWindowBounds(new Date("2027-01-01T15:00:00.000Z"));

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
      const { quarter } = courtWindowBounds(new Date(`${now}T15:00:00.000Z`));

      expect(quarter.start.toISOString()).toBe(`${expected}:00:00.000Z`);
    });
  });

  describe("fiscal year", () => {
    it("stays in the previous calendar year through September", () => {
      const { fiscalYear } = courtWindowBounds(
        new Date("2026-09-30T15:00:00.000Z"),
      );

      expect(fiscalYear.start.toISOString()).toBe("2025-10-01T04:00:00.000Z");
    });

    it("rolls over on October 1", () => {
      const { fiscalYear } = courtWindowBounds(
        new Date("2026-10-01T15:00:00.000Z"),
      );

      expect(fiscalYear.start.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    });
  });

  describe("daylight saving", () => {
    it("opens the day at EST midnight on the spring-forward day", () => {
      // Sunday 2026-03-08 — the clocks go forward at 02:00, after midnight.
      const { day, week } = courtWindowBounds(
        new Date("2026-03-08T15:00:00.000Z"),
      );

      expect(day.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
      expect(week.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    });

    it("opens each window at its own offset when a window spans a change", () => {
      // From January (EST) the fiscal year opened in October (EDT).
      const { day, fiscalYear } = courtWindowBounds(
        new Date("2026-01-15T15:00:00.000Z"),
      );

      expect(day.start.toISOString()).toBe("2026-01-15T05:00:00.000Z");
      expect(fiscalYear.start.toISOString()).toBe("2025-10-01T04:00:00.000Z");
    });
  });
});
