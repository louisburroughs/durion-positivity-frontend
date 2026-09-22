# Employee Register — design brief

Design source for the employee list page at `/app/people/employees`. Five artboards in
`canvas.json`, authored as Design Component (`.dc.html`) files. `Main.dc.html` is interactive —
the permission switcher and the activate/deactivate flow both work.

Canvas: https://claude.ai/artifact/PA1Xk14WRbzb9KP8Pnrz2K

| Artboard | What it fixes |
| -------- | ------------- |
| `Main.dc.html` | Desktop register, 1440×1000. Nine columns, per-row actions, the status switch, the confirm dialog. |
| `Mobile.dc.html` | 390×844 card list. Every target ≥44px. |
| `Lifecycle.dc.html` | Which status transitions the switch owns, and what happens after confirm. |
| `States.dc.html` | `loading` / `empty` / `error` / `forbidden`. |
| `AccessModel.dc.html` | Every column and link mapped to the permission its destination route declares. |

## Visual language

Follows `design/DESIGN.md` (The Architectural Ledger) for layout and
`design/source/theme-tokens.md` for values — which is the split `DESIGN.md` itself asks for when it
names the token files as the implementation source of truth. Where `DESIGN.md` proposes Public Sans
and Inter, the ratified v2 token inventory (reconciled to `src/styles.css`) keeps **Barlow Semi
Condensed** for display and **Noto Sans** for body, and those win.

What that means in practice:

- **No 1px sectioning borders and no row dividers.** Containers are tonal plinths —
  `--brand-background` → `--brand-surface` → `--durion-graphite-100`. Rows separate by alternating
  tint (`#ffffff` / `#fafafb`). The one hairline is a ghost inset under the header well at 45%.
- **Editorial header.** All-caps overline in `--font-primary` 600 over a 38px 700 headline,
  asymmetric gutters (48px left, 32px right).
- **Ledger inputs.** `--durion-graphite-100` track, no border, 2px bottom stroke; teal on focus.
- **Controls at `--radius-sm`**, never pill — except status chips, which `design/HR/DESIGN.md`
  exempts. Primary CTA is the 135° `blue-800 → blue-700` gradient.
- **Restrained teal.** `--accent-strong` (`#006a6a`) carries the switch's on-state and the
  reactivate action; nothing else.
- Stat tiles, tinted header well, chip treatment and pagination follow the `TechRegister` precedent
  in this pack.

**Departure from the precedent:** `TechRegister` carries a right-hand watchlist rail. This table has
four more columns and needs the full 1360px, so "needs attention" became the third stat tile instead.

**Not shipped yet:** that third tile counts employees with no location or no application role, and
both of those fields arrive with the register projection (backend **#2155**). Until then the page
renders two tiles — Total workforce and Active — and the artboards show the target of three.

## Domain rules the design encodes

| Rule | Where it shows |
| ---- | -------------- |
| DECISION-PEOPLE-001 — `ACTIVE` / `ON_LEAVE` / `SUSPENDED` / `TERMINATED` / `DISABLED` | The switch owns only `ACTIVE ⇄ DISABLED`. The other three render as read-only badges; `TERMINATED` is irreversible and stays on the offboard page. |
| DECISION-PEOPLE-024 — disable is privileged and explicitly confirmed | The switch opens a confirm dialog. It never writes optimistically. |
| DECISION-PEOPLE-002 — disable propagates by saga, downstream failure does not roll back | Row shows `Propagating…` after confirm; `Lifecycle.dc.html` shows the partial-sync banner. |
| DECISION-PEOPLE-014 — effective dating is half-open | Confirm dialog collects `assignmentEndDate` and says the end is exclusive. |
| DECISION-PEOPLE-003 — role assignments are scope-aware | Role chips carry `· G` (global) or `· L` (location). |
| DECISION-PEOPLE-004 — one primary location per person | Location cell shows the primary, with `+N more`. |
| DECISION-PEOPLE-013 — gate on named permissions, never role names | The preview switcher switches **permission sets**; `AccessModel.dc.html` names a code per row and no roles. |
| DECISION-PEOPLE-017 — optimistic concurrency | A 409 puts the page in its conflict error state naming the cause; the re-read happens when the user selects Retry, not automatically. |

> **Target state vs shipped.** These artboards draw the intended design, in which the switch works
> both ways. Only `ACTIVE → DISABLED` is implementable today: pos-people publishes no enable
> endpoint (backend issue **#2156**), so the shipped page renders a `DISABLED` row as a read-only
> badge. `Main.dc.html` and `Lifecycle.dc.html` both carry that caveat on the artboard itself.

## Access model

Two gates, both required: the route guard on the page, and per-cell / per-link gates inside it.
Actions the viewer cannot take are **absent**; columns they cannot read **stay and read
"Restricted"**, so the grid keeps its shape and a gate never reads as missing data.

The personas on the artboards illustrate permission sets — they are not gates. A tenant can mint a
role holding any subset of these codes.
