/** Observes DST, unlike a fixed -05:00 "EST" offset. */
export const COURT_TIME_ZONE = "America/New_York";

type CourtDayParts = { year: number; month: number; day: number };

const MONTH_DAY_YEAR_DATE_PATTERN =
  /^(?<month>\d{2})\/(?<day>\d{2})\/(?<year>\d{4})$/;

const partsInZone = (
  instant: Date,
  timeZone: string,
): CourtDayParts & { hour: number; minute: number; second: number } => {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  // NaN here would become an Invalid Date and silently scope the log to nothing.
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const parsed = Number(formatted.find((part) => part.type === type)?.value);
    if (Number.isNaN(parsed)) {
      throw new Error(`No ${type} in ${timeZone} date parts`);
    }
    return parsed;
  };

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
};

const zoneOffsetMs = (instant: Date, timeZone: string): number => {
  const p = partsInZone(instant, timeZone);
  const asIfUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

const startOfZoneDay = (
  { year, month, day }: CourtDayParts,
  timeZone: string,
): Date => {
  const naive = Date.UTC(year, month - 1, day);
  // Second pass settles DST-transition days, where the first guess lands wrong.
  const first = naive - zoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - zoneOffsetMs(new Date(first), timeZone));
};

export type Bounds = { start: Date; end: Date };

export const COURT_PERIOD_NAMES = [
  "day",
  "week",
  "month",
  "quarter",
  "fiscalYear",
] as const;

export type CourtPeriodName = (typeof COURT_PERIOD_NAMES)[number];
export type CourtPeriodRecord<T> = Record<CourtPeriodName, T>;

export const mapCourtPeriods = <T>(
  getValue: (name: CourtPeriodName) => T,
): CourtPeriodRecord<T> =>
  COURT_PERIOD_NAMES.reduce((periods, name) => {
    periods[name] = getValue(name);
    return periods;
  }, {} as CourtPeriodRecord<T>);

const FISCAL_YEAR_START_MONTH = 10;
const shiftUtcYear = (instant: Date, yearDelta: number): Date => {
  const shifted = new Date(instant.getTime());
  shifted.setUTCFullYear(shifted.getUTCFullYear() + yearDelta);
  return shifted;
};

export const parseMonthDayYearDate = (
  value: string,
): CourtDayParts | undefined => {
  const match = MONTH_DAY_YEAR_DATE_PATTERN.exec(value);
  if (!match?.groups) {
    return undefined;
  }

  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const year = Number(match.groups.year);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() + 1 !== month ||
    candidate.getUTCDate() !== day
  ) {
    return undefined;
  }

  return { year, month, day };
};

export const courtDayBoundsForDate = (
  day: CourtDayParts,
): { start: Date; end: Date } => {
  const nextDay = new Date(Date.UTC(day.year, day.month - 1, day.day + 1));

  return {
    start: startOfZoneDay(day, COURT_TIME_ZONE),
    end: startOfZoneDay(
      {
        year: nextDay.getUTCFullYear(),
        month: nextDay.getUTCMonth() + 1,
        day: nextDay.getUTCDate(),
      },
      COURT_TIME_ZONE,
    ),
  };
};

export const courtDayBoundsForDateString = (
  value: string,
): { start: Date; end: Date } | undefined => {
  const day = parseMonthDayYearDate(value);
  return day ? courtDayBoundsForDate(day) : undefined;
};

/** Court-local day containing `now`, as half-open [start, end) instants.
 *  Bounds, not a date predicate: AT TIME ZONE in a WHERE skips the indexes. */
export const courtDayBounds = (
  now: Date = new Date(),
): { start: Date; end: Date } => {
  const today = partsInZone(now, COURT_TIME_ZONE);
  const tomorrow = new Date(
    Date.UTC(today.year, today.month - 1, today.day + 1),
  );

  return {
    start: startOfZoneDay(today, COURT_TIME_ZONE),
    end: startOfZoneDay(
      {
        year: tomorrow.getUTCFullYear(),
        month: tomorrow.getUTCMonth() + 1,
        day: tomorrow.getUTCDate(),
      },
      COURT_TIME_ZONE,
    ),
  };
};

/** The five revenue periods, each opening at Court-local midnight and running
 *  to date — every `end` is `now`, not the end of the period. */
export const courtPeriodBounds = (
  now: Date = new Date(),
): CourtPeriodRecord<Bounds> => {
  const { year, month, day } = partsInZone(now, COURT_TIME_ZONE);

  // Read in UTC so the zone's clock time can't tip the date into a neighbouring day.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const quarterStartMonth = month - ((month - 1) % 3);
  const fiscalYear = month >= FISCAL_YEAR_START_MONTH ? year : year - 1;

  const end = new Date(now.getTime());
  // Date.UTC normalises out-of-range days, so a Sunday in the previous month
  // or year needs no special casing.
  const openingAt = (parts: CourtDayParts): Bounds => ({
    start: startOfZoneDay(parts, COURT_TIME_ZONE),
    end,
  });

  return {
    day: openingAt({ year, month, day }),
    week: openingAt({ year, month, day: day - weekday }),
    month: openingAt({ year, month, day: 1 }),
    quarter: openingAt({ year, month: quarterStartMonth, day: 1 }),
    fiscalYear: openingAt({
      year: fiscalYear,
      month: FISCAL_YEAR_START_MONTH,
      day: 1,
    }),
  } satisfies CourtPeriodRecord<Bounds>;
};

export const previousCourtPeriodBounds = (
  now: Date = new Date(),
): CourtPeriodRecord<Bounds> => {
  const currentPeriods = courtPeriodBounds(now);

  const shiftedNow = shiftUtcYear(now, -1);
  const previousPeriods = courtPeriodBounds(shiftedNow);
  const shiftedWeek = previousPeriods.week;

  const currentWeekDurationMs =
    currentPeriods.week.end.getTime() - currentPeriods.week.start.getTime();

  return {
    ...previousPeriods,
    week: {
      start: shiftedWeek.start,
      end: new Date(shiftedWeek.start.getTime() + currentWeekDurationMs),
    },
  } satisfies CourtPeriodRecord<Bounds>;
};
