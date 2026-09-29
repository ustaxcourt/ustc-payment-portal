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
