---
type: Guide
title: 'Frontend Exemplars: Precedents to Reuse'
description: A precedent catalog of file:line-cited frontend patterns (state machine, async ownership, read outcomes, auth gates, a11y, i18n, tests) to read before writing a new page or service.
status: stable
created: '2026-09-18'
tags: [frontend, exemplars, patterns]
---
# Frontend Exemplars

Read the sibling services and pages in your domain and this file before writing new code. Reuse
these helpers and shapes rather than re-deriving them; list the precedents you reused in the PR
description.

Every entry cites `file:line` on this branch. Where a pattern recurs, the canonical exemplar is
cited in full and the other sites are listed briefly — read the canonical one, not every sibling.

---

## 1. Page state machine

**Signal-pair state + keyed cache.** A routed page holds `readonly state = signal<PageState>('idle')` (with `PageState = 'idle' | 'loading' | 'ready' | 'error'`)
and a `readonly errorKey = signal<string | null>(null)`, and on failure always writes `state.set('error')`
before `errorKey.set(...)` — never the reverse, so a template branching on `state()` cannot render an
error panel with no message. `dispatch-board-page.component.ts:175-176` declares the pair; the ordering
rule is spelled out at `dispatch-board-page.component.ts:174` ("`state` always moves before `errorKey`")
and enforced at every write site, e.g. `dispatch-board-page.component.ts:2065-2066`. Nearly every page
component under `src/app/features/**` declares `readonly state = signal(...)` this way (grep `readonly state = signal`).

**Keyed cache so a stale board never renders under new controls.** `hasCachedData` compares a
`requestKey` (the current location+date the controls ask for) against a `cachedKey` (the location+date
the held data actually answers), and `showBoard` only renders the frame when the cache matches or a
load is in flight: `dispatch-board-page.component.ts:199-200,350,356,364`. Use this when a page has
selectable scope (a location, a date, a filter) and a slow response for the *old* scope must not paint
over the new one — see the guard at `dispatch-board-page.component.ts:2007` and the reset at
`dispatch-board-page.component.ts:2049,2070` when the read fails.

*Prevents:* a page rendering "ready" with no error text, or a slow response for a scope the user has
since navigated away from silently repainting the board.

---

## 2. Async result ownership

**Monotonic sequence guard, one counter per independent writer.** `dispatch-board-page.component.ts`
keeps three separate counters — `readSeq` (259), `enrichmentSeq` (186), `clockSeq` (197) — because they
guard three streams that must not cancel each other: bumping one only invalidates in-flight reads for
*that* stream. The comment at `dispatch-board-page.component.ts:186-196` explains why folding the clock
path into `enrichmentSeq` would be wrong (a clock write would then discard an enrichment read's bays and
roster). Guard sites: `dispatch-board-page.component.ts:610,1382,1396,1404,1787,1818,1851,1925-1926,1956,1968,2023,2037`.
A smaller, single-counter version of the same idea is `customer-list.component.ts:46` (`loadSeq`), checked
at `customer-list.component.ts:89,95` — reach for this shape first; add a second counter only when two
truly independent writers share one page, per the dispatch-board comment above.

**Deferred-settlement sets for pending UI unblocked only by the request that owns it.**
`owedSettlements` (`dispatch-board-page.component.ts:274,1777-1822`) and `owedClockSettlements`
(`dispatch-board-page.component.ts:291,1387,1430-1436`) are `Set<() => void>` callback queues: a caller
waiting on a read parks its unblock callback there, and only the read whose `seq` is still current pays
the whole set. Use this when several UI elements can be waiting on the same in-flight read and a stale
response must not release any of them.

**`UndoStep` — recording what a mutation is known to have produced, not just what it replaced.**
Defined at `src/app/features/shopmgmt/models/dispatch-board.models.ts:226-247` and consumed at
`dispatch-board-page.component.ts:1584,1660,1675`. Besides `previousId`, it records the outcome the write
is known to have produced: `currentMechanicId` (MECHANIC steps, so undo can choose assign versus reassign
without reading a row that a release has already emptied) and `previousPosition`/`currentPosition` (BAY
steps, so undoing a parked workorder restores its HOLD instead of releasing it, and a placement another
dispatcher has since changed is left alone). See the doc comment at `dispatch-board.models.ts:220-225`.

**`effect()` + `onCleanup` per ADR-0033.** Canonical clean example:
`src/app/features/order/pages/price-override/price-override-page.component.ts:41-83` — the constructor's
`effect(onCleanup => { const sub = ...subscribe(...); onCleanup(() => sub.unsubscribe()); }, { allowSignalWrites: true })`.
27 files under `src/app/features/**` use `onCleanup` (grep `onCleanup`); use this shape whenever an
`effect()` opens a subscription, so a route-param change or component teardown can't leave two loads
racing.

*Prevents:* a slow response overwriting fresher state, a released mechanic/bay card staying disabled
forever because its unblock callback was never paid, or an effect leaking a subscription across
navigations (ADR-0033).

---

## 3. Read outcomes

**`{ data, ok }` — the read's answer travels with whether it actually happened.** Canonical pair:
`capacity-calendar.service.ts:234` (`loadBays` → `Observable<{ bays: CapacityBay[]; ok: boolean }>`) and
`capacity-calendar.service.ts:258-268` (`loadTechnicians` → `{ roster: ...; ok: boolean }`); both
`catchError` to an empty array with `ok: false` rather than propagating the error, per the doc comment
at `capacity-calendar.service.ts:212-216` ("every upstream call degrades to empty rather than failing
the page"). The dispatch-board service mirrors this with named types: `TechnicianRoster.ok`
(`dispatch-board.service.ts:56-68`, populated at `dispatch-board.service.ts:224-256`) and
`ClockRead { states, ok }` (`dispatch-board.service.ts:100-118`, populated at `dispatch-board.service.ts:276-292`).
The doc comment at `dispatch-board.service.ts:104-115` states the rule directly: "an empty map is
equally 'nobody's state is visible' and 'the read failed' ... those call for different words."

**Consuming the outcome as a tri-state, not a boolean.** `dispatch-board-page.component.ts` keeps
`rosterRead` and `clockRead` as `'PENDING' | 'OK' | 'FAILED' (| 'NOT_TODAY')` signals
(`dispatch-board-page.component.ts:240,252`), not booleans, so a check like `clockIsActionable`
(`dispatch-board-page.component.ts:977`, `= isViewingToday() && clockRead() === 'OK'`) can refuse to let
the dispatcher act on a clock state the read never confirmed. Written at
`dispatch-board-page.component.ts:1424,1958,1964,1974`.

**404 (or equivalent) as absence, not failure.** `capacity-calendar.service.ts` distinguishes "no
schedule published" from "the read failed" with two private sentinels, `ABSENT`/`FAILED`
(`capacity-calendar.service.ts:77-78`), rolled up into `absent`/`failed` counts
(`capacity-calendar.service.ts:87-89,305-318`) and exposed as `locationHasNoSchedule`
(`capacity-calendar.service.ts:394`, `= load.total > 0 && load.absent === load.total`) versus `degraded`
(`capacity-calendar.service.ts:390`, driven by `failed` and by `!bays.ok || !technicians.ok`).
`workexec.service.ts:getWorkorderPickList` (`workexec.service.ts:1141-1142`, header-leg `catchError` +
docblock `1128-1137`) implements the per-leg pattern: catches the 404 on the header request alone
(whose contract promises "no pick list" for 404), leaving task-leg 404s as errors, and maps null to
the page's empty state; a 404 from the task read still errors (PR #289).

*Prevents:* an outage rendering as "nobody is on the roster" or "no schedule exists," and a page acting
on clock/roster data it never confirmed came back.

---

## 4. Domain rules already owned by a sibling

- **`PAGE_SIZE = 500` for paged bay/technician endpoints.** `shop-dashboard.service.ts:43`,
  `capacity-calendar.service.ts:50`, and `dispatch-board.service.ts:136` (named `ROSTER_PAGE_SIZE` there).
  Reuse the constant's *value and rationale* (a shop's bay/technician roster is assumed to fit one page);
  don't invent a different page size for a fourth caller of the same endpoints.
- **Closed-link-reads-idle.** "A unit still linked to a closed workorder reads as idle: the work is
  done, the bay is free" — `shop-dashboard.service.ts:451-454`.
- **Never surface a raw UUID.** The service never puts an id where a name belongs: `resourceName(...)`
  (called at `shop-dashboard.service.ts:296-299`, see the comment there; defined at
  `shop-dashboard.service.ts:436`) leaves `unitName` empty for an unresolvable resource, and the template supplies the translated fallback
  (`open-workorder-roster.component.html:57`, `SHOPMGMT.SHOP_DASHBOARD.ROSTER.UNKNOWN_UNIT`). Keep that
  boundary: services return nothing for the unknown case, templates translate it.
- **`heldSkillCodes` — ACTIVE-only credentials count as competence.** `capacity-calendar.service.ts:665-672`
  (also present, same signature/contract, at `dispatch-board.service.ts` per its roster read at
  `dispatch-board.service.ts:224-256` which calls the sibling directly — grep `heldSkillCodes` for both
  call sites). Expired/revoked/superseded credentials are deliberately excluded.
- **`isOpenStatus`.** `src/app/features/shopmgmt/models/shop-dashboard.models.ts:156-158`: "True for
  every status except COMPLETED and CANCELLED." **No `isClosedStatus` export exists** on this branch —
  only a private `CLOSED_STATUSES` set backs `isOpenStatus`; don't cite or invent a separate
  `isClosedStatus` helper, negate `isOpenStatus` instead.
- **`listBays` as the bay roster of record.** `shop-dashboard.service.ts:679-684` (`listBays` /
  `listBaysResult`, the latter also carrying a `failed` flag). `capacity-calendar.service.ts:238` and
  `dispatch-board.service.ts:187` call the same SDK `BayAPIService.listBays` with the same
  `(locationId, undefined, undefined, 0, PAGE_SIZE)` shape — match that call shape for a new bay read
  rather than passing a status filter, per the comment at `capacity-calendar.service.ts:235-237` (an
  `OUT_OF_SERVICE` bay must still show up, hatched).
- **Idempotency key per attempt.** `workorder-assign-page.component.ts:7,196-197` — `uuidv4()` generated
  fresh for each `assignTechnician`/`reassignTechnician` call, not reused across retries.
- **`COMMON.NOT_AVAILABLE` for a nameless person.** `mechanic-availability-page.component.ts:88` —
  `name || this.translate.instant('COMMON.NOT_AVAILABLE')`.
- **`isoDateLocal` for local-day strings (ADR-0038).** Defined at
  `src/app/features/shopmgmt/models/capacity-calendar.models.ts:288-292`, with the doc comment there
  naming the bug it avoids: `toISOString().slice(0, 10)` is UTC and returns tomorrow's date near the end
  of a local day in any UTC-negative zone. Paired with `parseIsoDateLocal`
  (`capacity-calendar.models.ts:294-297`) for the reverse conversion. 11 files reference `isoDateLocal`
  (grep for it) — import it rather than reimplementing local-date formatting.

*Prevents:* re-deriving a shop-dashboard/dispatch-board business rule slightly differently in a third
place, so two pages disagree on what "idle," "no schedule," or "competent" means for the same data.

---

## 5. Authorization gates

**Route-level gate.** `src/app/core/security/route-permissions.ts:29-30` — `permissionsInDomains(...)`
matches every catalog permission under a domain prefix (a trailing `:`) or an exact code, and route
groups are gated on the *union* of their domain's permissions (doc comment at
`route-permissions.ts:8-13`) so the gate can only ever over-admit, never lock out a legitimate holder.
`route-access.ts:35-44` (`canAccess(auth, requirement)`) is the function that actually evaluates a
route's `permissions`/`allPermissions`/`roles` requirement against `AuthService`, calling
`auth.hasAnyPermission(...)` (`route-access.ts:40`) and `auth.hasPermission(...)` (`route-access.ts:41`).
`AuthService.hasAnyPermission` itself is `src/app/core/services/auth.service.ts:234-238`; there is no
`AuthService.canAccess` — that name belongs to the free function in `route-access.ts`, not a method.

**Control + method both gated, independently tested.** The dispatch board gates a slot's clickability
*and* its handler on the same predicate — never one without the other — via `canTakeMechanic`
(`dispatch-board-page.component.ts:700-706`), `canTakeBay` (`:715-723`), `canClearMechanic` (`:770-772`),
`canClearBay` (`:774-776`), all built on `canAssignMechanic`/`canAssignBay`
(`dispatch-board-page.component.ts:303,314`). The permission split this defends —
`workorder:position:assign` grants bay control, `workorder:operationalContext:override` must not —
has its own positive and negative tests: granted at
`dispatch-board-page.component.spec.ts:2814-2828` ("enables the bay controls for a session holding only
workorder:position:assign") and denied at `dispatch-board-page.component.spec.ts:2833-2850` ("disables
the bay controls for a session holding only workorder:operationalContext:override"), each asserting both
the computed signal and the rendered control's `disabled` state.

*Prevents:* a control that is clickable but whose handler 403s anyway (or the reverse — a handler gated
correctly behind a disabled-looking control that a keyboard/automation path can still invoke), and a
permission regression that silently restores an authority a prior PR deliberately split off (see the
`#2059` comment at `dispatch-board-page.component.spec.ts:2811-2813`).

---

## 6. Accessibility mechanics

- **Native modal directive.** `src/app/shared/modal-dialog.directive.ts:25` —
  `@Directive({ selector: 'dialog[appModalDialog]', standalone: true })`, applied to a `<dialog>`
  rendered behind an `@if`. Consumers: `workorder-parts-page.component.html`,
  `workorder-detail-page.component.html`, `estimate-revise-page.component.html`,
  `approval-submit-page.component.html`, `supplier-bindings-panel.component.html`, and the dispatch
  board's own dialog (`dispatch-board-page.component.html`, `dispatch-board-page.component.ts`) — pick
  any one of these as your usage example.
- **`.sr-only`.** Single canonical definition at `src/styles.css:954-955`; the comment there says
  components must not redefine it locally.
- **`aria-describedby` hint wiring.** `dispatch-board-page.component.html:141,195,210,233` —
  `[attr.aria-describedby]="clockHint ? 'mclock-hint-' + mechanic.personId : null"`, conditional so a
  control with no hint doesn't point at a non-existent id. `shop-dashboard-page.component.html:30` is
  the location-hint sibling.
- **`aria-labelledby` section landmarks.** `dispatch-board-page.component.html:1,119,250,289` and
  `shop-dashboard-page.component.html:1,128,139` — every major `<section>` is labelled by its own
  heading id rather than left to an implicit accessible name.
- **Focus restoration after a control removes itself.** `restoreClockFocus`
  (`dispatch-board-page.component.ts:1324-1334`), called from `settleClockCard`
  (`dispatch-board-page.component.ts:1319-1322`): runs in `afterNextRender` specifically *after* the
  re-read has moved/destroyed the old card, and only takes over focus if nothing else claimed it in the
  meantime (comment at `:1317-1319,1332-1334`).
- **`:focus-within` ring on the search shell.** `dispatch-board-page.component.css:551-556` — the
  input's own outline is removed so the ring can be drawn on the whole `.search` shell; the comment
  there flags that without the pair a keyboard user gets no focus indication at all.
- **`role="alert"` refusal/error panel.** `dispatch-board-page.component.html:104-110` — the
  `state-panel` shown on `error()`, paired with a retry button.
- **`aria-live="polite"` banners.** `dispatch-board-page.component.html:87` (the stale/quality banners
  row) and `:101` (the loading state).

*Prevents:* a hint or heading that exists visually but is invisible to assistive tech, a dialog that
traps or leaks focus, and a mutation that silently drops keyboard focus onto `<body>`.

---

## 7. i18n

**Translated fallback nested inside another key's interpolation param, via the pipe itself** — not a
component-side string concat: `approval-submit-page.component.html:33` —
`{{ 'WORKEXEC.APPROVAL.SUBMIT.CHECK_TRANSITION' | translate: { status: ('WORKEXEC.APPROVAL.SUBMIT.PENDING_APPROVAL' | translate) } }}`.
`schedule-view-page.component.html:24,47,102,205,224,238,242,246,268,328,387,428` is the broader family
of `| translate: { ... }` interpolation-param usage in the same domain.

**`number` pipe for hours.** `dispatch-board-page.component.html:36,164,552` —
`(stats().toAssignHours | number: '1.0-1')` passed as the interpolation param to a translated
`...HOURS`/`FREE_HOURS` key, so the unit word stays translated while the numeral is locale-formatted.

**Locale files.** Six under `src/assets/i18n/`: `en-US.json`, `es-MX.json`, `es-US.json`, `fr-CA.json`,
`fr-FR.json`, `qps-ploc.json`. `npm run i18n:check` runs `check-missing-keys.mjs`,
`check-hardcoded-strings.mjs`, `check-hardcoded-ts-strings.mjs`, then the pseudo-locale check
(`package.json:19-24`).

**Reading real bundles + Label-in-Name assertions.** `dispatch-board-page.i18n.spec.ts` loads the
shipped locale JSON directly rather than mocking `TranslateService` — see `describe` blocks at
`:182` (key derivation), `:205` (every emitted key resolves), `:220` (placeholder integrity), `:290/347/379/424`
("en-US says what the code does" — asserts the *content*, not just the key, for free hours, the break
bin note, the clock hint, and the bin chip), and `:452` ("clock controls satisfy Label in Name, in every
shipped locale" — WCAG 2.2 SC 2.5.3, comment at `:444-451`).

*Prevents:* a raw i18n key rendering in production copy, a numeral rendered without locale grouping/decimal
rules, and a button whose visible label doesn't contain the words a speech-input user would say to
activate it (Label in Name).

---

## 8. Tests

**`*.a11y.spec.ts` axe pattern.** Three files on this branch:
`src/app/features/shopmgmt/components/open-workorder-roster/open-workorder-roster.a11y.spec.ts`,
`src/app/features/shopmgmt/pages/schedule-view/schedule-view-page.a11y.spec.ts`,
`src/app/features/shopmgmt/pages/dispatch-board/dispatch-board-page.a11y.spec.ts`.

**`Subject`-driven async stubs for ordering tests.** `dispatch-board-page.component.spec.ts:427`
(`dispatchBoardServiceStub.getDashboard.mockReturnValueOnce(new Subject())`) and `:1047,1064`
(`getClockStates` held open the same way) — hold a read open, assert the pending/disabled UI state,
then emit and assert the settle, to pin down ordering that a synchronous `of(...)` stub can't exercise.

**Negative permission test.** `dispatch-board-page.component.spec.ts:2833`
("disables the bay controls for a session holding only workorder:operationalContext:override") — see
§5 above for the full pairing with its positive counterpart.

**`HttpTestingController` service spec per ADR-0035.** Canonical: `src/app/core/services/api-base.service.spec.ts:3,9,21`
— domain services under `features/**/services/*.service.ts` instead mock the generated SDK facade
directly (e.g. `capacity-calendar.service.spec.ts:20-27`, `{ provide: BayAPIService, useValue: { listBays: vi.fn() } }`)
because `api-base.service.ts` is the one place that actually calls `HttpClient`; use the SDK-facade-mock
shape for a new domain service spec, not `HttpTestingController` directly, unless you are testing
`api-base.service.ts` itself.

**Typed fixtures per ADR-0032.** `capacity-calendar.service.spec.ts:33-34` —
`const catalogService = (overrides: Partial<ServiceDto> = {}): ServiceDto => ({ ...defaults, ...overrides }) as ServiceDto`
— a factory typed against the real SDK interface, so a phantom field name fails to compile rather than
silently passing. No dedicated `*.fixtures.ts` files exist on this branch; the pattern lives as inline
typed factories/constants in each spec.

**SDK positional-argument assertion.** `capacity-calendar.service.spec.ts:137-143` —
`expect(techs.listLocationTechnicians).toHaveBeenCalledWith(REQUEST.locationId, 'ACTIVE', undefined, undefined, 0, expect.any(Number))`,
asserting the exact positional shape (including which optional args are left `undefined` on purpose,
per the comment at `:135-136`) rather than a loose `expect.objectContaining`.

*Prevents:* a spec that only exercises the synchronous-resolve path and never catches a race, a
permission split that silently regresses to the old, wider grant, and a service test that calls the SDK
with args shifted one position over without failing.

---

## 9. Untrusted content

No merged exemplar exists on `master` yet. ADR-0065 is the specification: a parsed token tree instead of
`innerHTML`, URL normalisation before an allowlist check applied to every URL-bearing block, a formula-lead
prefix on CSV cells built from untrusted text, and browser storage keyed by `tid` and `sub`. The first
implementation is in review on PR #288 and is not on this branch, so this section deliberately cites no
files; once it merges, add its `file:line` citations here and reuse those helpers rather than writing a
second sanitiser.

---

## How to add an exemplar

Cite the real `file:line` you found by reading the code, not a remembered name — if the symbol doesn't
exist on your branch, say so rather than guessing. Keep each entry to one paragraph: pattern name, what
it guarantees, the canonical `file:line`, when to reach for it, and the one-clause review finding it
prevents. When a pattern already has a shared helper (a model function, a service method, a directive),
point to that helper and tell the reader to import it — don't restate its logic as a "you can also do
this locally" alternative.

## Section → ADR map

| Section | Governing ADR(s) |
| --- | --- |
| 1. Page state machine | ADR-0031 |
| 2. Async result ownership | ADR-0033, ADR-0063 |
| 3. Read outcomes | ADR-0064 |
| 4. Domain rules already owned by a sibling | ADR-0038, ADR-0062 |
| 5. Authorization gates | ADR-0040 |
| 6. Accessibility mechanics | ADR-0029 |
| 7. i18n | ADR-0030, ADR-0037 |
| 8. Tests | ADR-0032, ADR-0035 |
| 9. Untrusted content | ADR-0065 |
