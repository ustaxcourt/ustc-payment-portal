/** Observes DST, unlike a fixed -05:00 "EST" offset. */
export const COURT_TIME_ZONE = "America/New_York";

type DayParts = { year: number; month: number; day: number };

const partsInZone = (
  instant: Date,
  timeZone: string,
): DayParts & { hour: number; minute: number; second: number } => {
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

  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(formatted.find((part) => part.type === type)?.value);

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
  { year, month, day }: DayParts,
  timeZone: string,
): Date => {
  const naive = Date.UTC(year, month - 1, day);
  // Re-derived once: the second pass settles DST-transition days, where the
  // first guess lands on the wrong side of the change.
  const first = naive - zoneOffsetMs(new Date(naive), timeZone);
  return new Date(naive - zoneOffsetMs(new Date(first), timeZone));
};

/**
 * The Court-local calendar day containing `now`, as a half-open [start, end)
 * range of absolute instants. Bounds rather than a date predicate, because a
 * WHERE that wraps the column in AT TIME ZONE cannot use the timestamp indexes.
 */
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
