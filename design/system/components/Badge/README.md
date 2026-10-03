# Badge

A square status tag on one of the six theme-aware status pairs: `.badge` plus `.badge--<kind>`.

**Kinds**: `error`, `warning`, `success`, `info`, `ready`, `neutral`, each painting `--status-<kind>-bg` with `--status-<kind>-fg` (AA in light and dark). Map a domain status onto a kind, never onto a raw colour. The app has no shared status-to-kind map yet; use this one for workorders: Draft → neutral, Approved and Assigned → info, Work in progress → info, Awaiting parts and Awaiting approval → warning, Ready for pickup → ready, Completed → success, Cancelled → neutral. For invoices: Paid → success, Pending → warning, Unpaid → error.

**The consumer provides** the status label from i18n, in sentence case. Badges sit inline after a name or in a table cell; keep them to a few words.

Use Badge in tables and dense rows; use StatusChip for the pill style in headers and cards.
