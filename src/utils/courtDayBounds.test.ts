import {
  COURT_PERIOD_NAMES,
  COURT_TIME_ZONE,
  courtDayBounds,
  courtDayBoundsForDateString,
  courtPeriodBounds,
  parseMonthDayYearDate,
  partsInZone,
  previousCourtPeriodBounds,
  shiftCourtYear,
  zonedDateTimeToUtc,
} from "./courtDayBounds";

const hoursBetween = (start: Date, end: Date): number =>
  (end.getTime() - start.getTime()) / 3_600_000;

const courtTimeOfDay = (
  instant: Date,
): { hour: number; minute: number; second: number } => {
  const { hour, minute, second } = partsInZone(instant, COURT_TIME_ZONE);
  return { hour, minute, second };
};

describe("courtDayBounds", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([
    [
      "summer day at EDT midnight (UTC-4)",
      "2026-08-03T15:00:00.000Z",
      "2026-08-03T04:00:00.000Z",
      "2026-08-04T04:00:00.000Z",
    ],
    [
      "winter day at EST midnight (UTC-5)",
      "2026-01-15T15:00:00.000Z",
      "2026-01-15T05:00:00.000Z",
      "2026-01-16T05:00:00.000Z",
    ],
    [
      "a late Court evening on its own day",
      "2026-08-04T03:30:00.000Z",
      "2026-08-03T04:00:00.000Z",
      "2026-08-04T04:00:00.000Z",
    ],
    [
      "an early Court morning on its own day",
      "2026-08-03T04:30:00.000Z",
      "2026-08-03T04:00:00.000Z",
      "2026-08-04T04:00:00.000Z",
    ],
    [
      "a month boundary",
      "2026-08-31T15:00:00.000Z",
      "2026-08-31T04:00:00.000Z",
      "2026-09-01T04:00:00.000Z",
    ],
    [
      "a year boundary",
      "2026-12-31T15:00:00.000Z",
      "2026-12-31T05:00:00.000Z",
      "2027-01-01T05:00:00.000Z",
    ],
  ])("brackets %s", (_label, now, expectedStart, expectedEnd) => {
    const { start, end } = courtDayBounds(new Date(now));

    expect(start.toISOString()).toBe(expectedStart);
    expect(end.toISOString()).toBe(expectedEnd);
  });

  it("defaults to the current instant when none is given", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-03T15:00:00.000Z"));

    const { start, end } = courtDayBounds();

    expect(start.toISOString()).toBe("2026-08-03T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-04T04:00:00.000Z");
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

describe("courtPeriodBounds", () => {
  // Monday 2026-08-17, 11:00 EDT.
  const MONDAY = new Date("2026-08-17T15:00:00.000Z");

  afterEach(() => {
    jest.useRealTimers();
  });

  it("defaults to the current instant when none is given", () => {
    jest.useFakeTimers().setSystemTime(MONDAY);

    const periods = courtPeriodBounds();

    expect(periods.day.start.toISOString()).toBe("2026-08-17T04:00:00.000Z");
    expect(periods.day.end.toISOString()).toBe(MONDAY.toISOString());
  });

  it("exports the canonical period names once, in order", () => {
    expect(COURT_PERIOD_NAMES).toEqual([
      "day",
      "week",
      "month",
      "quarter",
      "fiscalYear",
    ]);
  });

  it("opens every period at Court-local midnight", () => {
    const periods = courtPeriodBounds(MONDAY);

    expect(periods.day.start.toISOString()).toBe("2026-08-17T04:00:00.000Z");
    expect(periods.week.start.toISOString()).toBe("2026-08-16T04:00:00.000Z");
    expect(periods.month.start.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(periods.quarter.start.toISOString()).toBe(
      "2026-07-01T04:00:00.000Z",
    );
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

  it("derives the previous year's comparison periods with the same keys", () => {
    const previousPeriods = previousCourtPeriodBounds(MONDAY);
    const currentPeriods = courtPeriodBounds(MONDAY);

    expect(Object.keys(previousPeriods)).toEqual([...COURT_PERIOD_NAMES]);
    expect(previousPeriods.day.start.toISOString()).toBe(
      "2025-08-17T04:00:00.000Z",
    );
    expect(previousPeriods.day.end.toISOString()).toBe(
      "2025-08-17T15:00:00.000Z",
    );
    expect(previousPeriods.fiscalYear.start.toISOString()).toBe(
      "2024-10-01T04:00:00.000Z",
    );
    expect(previousPeriods.week.start.toISOString()).toBe(
      "2025-08-17T04:00:00.000Z",
    );
    expect(previousPeriods.week.end.toISOString()).toBe(
      "2025-08-18T15:00:00.000Z",
    );
    expect(courtTimeOfDay(previousPeriods.week.end)).toEqual(
      courtTimeOfDay(currentPeriods.week.end),
    );
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

describe("previousCourtPeriodBounds", () => {
  it.each([
    // Current year is on daylight time; prior year is still on standard time.
    [
      "spring transition gap",
      "2025-03-09T15:00:00.000Z", // 11:00 AM EDT
      "2024-03-09T16:00:00.000Z", // 11:00 AM EST
    ],
    // Current year is on standard time; prior year is still on daylight time.
    [
      "fall transition gap",
      "2026-11-01T15:00:00.000Z", // 10:00 AM EST
      "2025-11-01T14:00:00.000Z", // 10:00 AM EDT
    ],
  ])(
    "keeps the previous day-to-date end aligned across the %s",
    (_label, now, expectedPreviousEnd) => {
      const { day } = previousCourtPeriodBounds(new Date(now));
      expect(day.end.toISOString()).toBe(expectedPreviousEnd);
    },
  );

  describe("week", () => {
    it.each([
      [
        "spring transition gap",
        "2025-03-09T15:00:00.000Z", // Sunday, 11:00 AM EDT
        "2024-03-03T05:00:00.000Z", // Sunday midnight EST
        "2024-03-03T16:00:00.000Z", // 11:00 AM EST
      ],
      [
        "fall transition gap",
        "2026-11-01T15:00:00.000Z", // Sunday, 10:00 AM EST
        "2025-10-26T04:00:00.000Z", // Sunday midnight EDT
        "2025-10-26T14:00:00.000Z", // 10:00 AM EDT
      ],
      [
        "spring transition gap held by the prior week alone",
        "2026-03-15T14:00:00.000Z", // Sunday, 10:00 AM EDT
        "2025-03-09T05:00:00.000Z", // Sunday midnight EST
        "2025-03-09T14:00:00.000Z", // 10:00 AM EDT, past that day's 02:00 jump
      ],
      [
        "fall transition gap held by the prior week alone",
        "2026-11-08T15:00:00.000Z", // Sunday, 10:00 AM EST
        "2025-11-02T04:00:00.000Z", // Sunday midnight EDT
        "2025-11-02T15:00:00.000Z", // 10:00 AM EST, past that day's 02:00 fall back
      ],
    ])(
      "closes the previous week-to-date on the Court wall clock across the %s",
      (_label, now, expectedStart, expectedEnd) => {
        const { week } = previousCourtPeriodBounds(new Date(now));

        expect(week.start.toISOString()).toBe(expectedStart);
        expect(week.end.toISOString()).toBe(expectedEnd);
        expect(courtTimeOfDay(week.end)).toEqual(
          courtTimeOfDay(courtPeriodBounds(new Date(now)).week.end),
        );
      },
    );

    it("keeps the elapsed duration when neither week crosses a change", () => {
      const now = new Date("2026-08-17T15:00:00.000Z");
      const previous = previousCourtPeriodBounds(now);
      const current = courtPeriodBounds(now);

      expect(hoursBetween(previous.week.start, previous.week.end)).toBe(
        hoursBetween(current.week.start, current.week.end),
      );
    });

    it("advances past the gap when the matching Court time never occurred", () => {
      // Sunday 2026-03-15 02:30 EDT. The prior week opens on 2025-03-09, whose
      // 02:00-02:59 the clocks skipped, so no instant there reads 02:30: the
      // week closes after the gap rather than an hour before it.
      const now = new Date("2026-03-15T06:30:00.000Z");
      const { week } = previousCourtPeriodBounds(now);

      expect(week.end.toISOString()).toBe("2025-03-09T07:30:00.000Z");
      expect(courtTimeOfDay(week.end)).toEqual({
        hour: 3,
        minute: 30,
        second: 0,
      });
      // With no wall-clock match available, both weeks run the same elapsed time.
      expect(hoursBetween(week.start, week.end)).toBe(
        hoursBetween(
          courtPeriodBounds(now).week.start,
          courtPeriodBounds(now).week.end,
        ),
      );
    });

    it("carries the weekday offset past the end of the month", () => {
      // Tuesday 2026-09-01; the prior year's week opened Sunday 2025-08-31.
      const { week } = previousCourtPeriodBounds(
        new Date("2026-09-01T15:00:00.000Z"),
      );

      expect(week.start.toISOString()).toBe("2025-08-31T04:00:00.000Z");
      expect(week.end.toISOString()).toBe("2025-09-02T15:00:00.000Z");
    });
  });
});

describe("shiftCourtYear", () => {
  it("shifts a normal date by one year", () => {
    expect(
      shiftCourtYear(new Date("2024-06-15T12:34:56Z"), -1).toISOString(),
    ).toBe("2023-06-15T12:34:56.000Z");
  });

  it("maps leap day to february 28 in a non-leap year", () => {
    expect(
      shiftCourtYear(new Date("2024-02-29T12:34:56Z"), -1).toISOString(),
    ).toBe("2023-02-28T12:34:56.000Z");
  });

  it("preserves leap day when the target year is also a leap year", () => {
    expect(
      shiftCourtYear(new Date("2024-02-29T12:34:56Z"), 4).toISOString(),
    ).toBe("2028-02-29T12:34:56.000Z");
  });

  it("preserves New York wall-clock time across DST changes", () => {
    expect(
      shiftCourtYear(new Date("2025-03-09T15:00:00.000Z"), -1).toISOString(),
    ).toBe("2024-03-09T16:00:00.000Z");
  });

  it("preserves New York wall-clock time across the fall DST transition", () => {
    expect(
      shiftCourtYear(new Date("2026-11-01T15:00:00.000Z"), -1).toISOString(),
    ).toBe("2025-11-01T14:00:00.000Z");
  });
});

describe("zonedDateTimeToUtc", () => {
  it("converts an EST time to UTC", () => {
    const utcDate = zonedDateTimeToUtc(
      {
        year: 2026,
        month: 1,
        day: 15,
        hour: 5,
        minute: 0,
        second: 0,
      },
      COURT_TIME_ZONE,
    );

    expect(utcDate.toISOString()).toBe("2026-01-15T10:00:00.000Z");
  });

  it("converts an EDT time to UTC", () => {
    const utcDate = zonedDateTimeToUtc(
      {
        year: 2026,
        month: 8,
        day: 3,
        hour: 5,
        minute: 0,
        second: 0,
      },
      COURT_TIME_ZONE,
    );

    expect(utcDate.toISOString()).toBe("2026-08-03T09:00:00.000Z");
  });
  it.each([
    "2026-01-15T12:34:56.000Z", // EST
    "2026-08-03T12:34:56.000Z", // EDT
    "2025-03-09T15:00:00.000Z", // DST transition scenario
    "2026-11-01T15:00:00.000Z", // DST transition scenario
  ])("round-trips %s through America/New_York", (instant) => {
    const parts = partsInZone(new Date(instant), COURT_TIME_ZONE);

    expect(zonedDateTimeToUtc(parts, COURT_TIME_ZONE).toISOString()).toBe(
      instant,
    );
  });

  it.each([
    // The clocks jump 02:00 -> 03:00, so this whole hour never happened.
    ["02:00", 0, "2025-03-09T07:00:00.000Z", 3],
    ["02:30", 30, "2025-03-09T07:30:00.000Z", 3],
    ["02:59", 59, "2025-03-09T07:59:00.000Z", 3],
  ])(
    "advances %s on the spring-forward day, which never occurred",
    (_label, minute, expected, expectedHour) => {
      const utcDate = zonedDateTimeToUtc(
        { year: 2025, month: 3, day: 9, hour: 2, minute, second: 0 },
        COURT_TIME_ZONE,
      );

      expect(utcDate.toISOString()).toBe(expected);
      expect(courtTimeOfDay(utcDate).hour).toBe(expectedHour);
    },
  );

  it("keeps the hour either side of the gap where the local time exists", () => {
    const before = zonedDateTimeToUtc(
      { year: 2025, month: 3, day: 9, hour: 1, minute: 30, second: 0 },
      COURT_TIME_ZONE,
    );
    const after = zonedDateTimeToUtc(
      { year: 2025, month: 3, day: 9, hour: 3, minute: 30, second: 0 },
      COURT_TIME_ZONE,
    );

    expect(before.toISOString()).toBe("2025-03-09T06:30:00.000Z");
    expect(after.toISOString()).toBe("2025-03-09T07:30:00.000Z");
  });

  it.each([
    ["spring", Date.UTC(2025, 2, 1), Date.UTC(2025, 2, 16)],
    ["fall", Date.UTC(2025, 10, 1), Date.UTC(2025, 10, 16)],
  ])(
    "leaves every %s instant that really happened where it was",
    (_label, from, to) => {
      // Every half hour across the transition: the gap check must fire on the
      // missing hour alone and perturb nothing else.
      const drifted: string[] = [];
      for (let t = from; t < to; t += 1_800_000) {
        const instant = new Date(t);
        const parts = partsInZone(instant, COURT_TIME_ZONE);
        const resolved = zonedDateTimeToUtc(parts, COURT_TIME_ZONE);

        // The fall-back hour maps to two instants, so only its wall clock can
        // round-trip; every other reading must return the instant it came from.
        if (courtTimeOfDay(resolved).hour !== parts.hour) {
          drifted.push(instant.toISOString());
        }
      }

      expect(drifted).toEqual([]);
    },
  );
});

describe("partsInZone", () => {
  it("returns the correct parts for a given instant and time zone", () => {
    const instant = new Date("2026-01-15T12:34:56Z");
    const parts = partsInZone(instant, COURT_TIME_ZONE);
    expect(parts).toEqual({
      year: 2026,
      month: 1,
      day: 15,
      hour: 7,
      minute: 34,
      second: 56,
    });
  });
});
