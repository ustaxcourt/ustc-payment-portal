import {
  courtDayBounds,
  courtDayBoundsForDateString,
  parseMonthDayYearDate,
} from "./courtDayBounds";

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

describe("parseMonthDayYearDate", () => {
  it("accepts valid MM/DD/YYYY dates", () => {
    expect(parseMonthDayYearDate("08/10/2026")).toEqual({
      year: 2026,
      month: 8,
      day: 10,
    });
  });

  it("rejects invalid calendar dates", () => {
    expect(parseMonthDayYearDate("02/30/2026")).toBeUndefined();
    expect(parseMonthDayYearDate("2026-08-10")).toBeUndefined();
  });
});

describe("courtDayBoundsForDateString", () => {
  it("returns the full Court-local day for a summer date", () => {
    const bounds = courtDayBoundsForDateString("08/10/2026");

    expect(bounds?.start.toISOString()).toBe("2026-08-10T04:00:00.000Z");
    expect(bounds?.end.toISOString()).toBe("2026-08-11T04:00:00.000Z");
  });

  it("returns undefined for invalid input", () => {
    expect(courtDayBoundsForDateString("8/10/2026")).toBeUndefined();
  });
});
