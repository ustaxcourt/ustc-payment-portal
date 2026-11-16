---
"@ustaxcourt/payment-portal": patch
---

Fixed the prior-year weekly bounds used for dashboard year-over-year trends.
`previousCourtPeriodBounds` closed the comparison week by adding the current
week's elapsed milliseconds to that week's start, which preserves elapsed time
rather than Court-local wall-clock time. When a daylight saving change fell
inside one of the two compared weeks but not the other, the prior-year window
ended exactly an hour off — either direction, depending on which week held the
change — so `getRevenueSummary` and `getTransactionLog` reported weekly trends
against a window that did not match the current one. The week now closes on the
Court-local weekday and time of day, matching how the `day`, `month`, `quarter`,
and `fiscalYear` periods already behaved. Only the `week` period changes, and
only for weeks where a transition is in play.

Gave `zonedDateTimeToUtc` a defined policy for local times that never occurred.
The clocks jump 02:00 to 03:00 each spring, so a request for a time inside that
hour has no matching instant; the function resolved it to an hour *before* the
one asked for. It now advances past the transition instead, so a period end is
never pulled back before the time it was asked for. This reaches every period
end through `shiftCourtYear`, so the five periods agree. Times that really
occurred are unaffected, as is the ambiguous hour repeated each fall. Note that
the two windows still end on different Court clock readings inside that gap —
no instant carries the requested reading — but the resolved end now sits the
same elapsed distance into its period as the current one.
