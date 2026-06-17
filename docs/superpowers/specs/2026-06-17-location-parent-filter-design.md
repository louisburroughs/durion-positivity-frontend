# Location Parent-Location Filter — Design

**Date:** 2026-06-17
**Repo:** durion-positivity-frontend
**Scope:** Frontend only. No backend / SDK / openapi changes.

## Problem

The location module's **mobile-units**, **bays**, and **storage-locations** pages give
no way to choose which parent location to search or edit:

- `bays` and `storage-locations` read the parent `locationId` only from the `?locationId`
  route query param. Landing on the page without it shows nothing and offers no picker.
- `mobile-units` calls `listMobileUnits()` (returns all units, each carrying a
  `baseLocationId`) with no parent scoping at all.

## Goal

Add a consistent parent-location selector to all three pages so the user explicitly
picks a location to scope the view, with the selection reflected in the URL.

## Decisions (agreed)

1. **Selector style:** searchable typeahead (not a plain dropdown).
2. **Before a location is selected:** show a prompt ("Select a location to view …");
   do not list anything. Applies to all three pages.
3. **Mobile units:** require a selection like the others (no "All" default); filter the
   `listMobileUnits()` result client-side by `baseLocationId === selectedId`.
4. **URL state:** selection syncs to the `?locationId` query param (shareable, survives refresh).
5. **Suggestions show the address** as a secondary line.
6. **Invalid `?locationId`** (not found in the locations list) is handled gracefully.

## Components

### `LocationPickerComponent` (new)
Path: `src/app/features/location/components/location-picker/`

A reusable searchable typeahead, used by all three pages. Self-contained and testable.

- **Inputs:**
  - `selectedId?: string` — preselect / reflect external (URL) state.
- **Outputs:**
  - `locationSelected: EventEmitter<string>` — emits the chosen location id.
  - `invalidSelection: EventEmitter<string>` — emits when `selectedId` is set but not
    found among loaded locations (lets the host show a "not found" notice).
- **Behavior:**
  - Loads locations once via `LocationService.getAllLocations()` (typed to
    `LocationResponseDTO`).
  - Filters as the user types: match on `name`, `code`, or address text
    (case-insensitive `includes`).
  - Each suggestion: primary line = `name` (fallback `code`); secondary line = address —
    `mailingAddress` if present, else `addressLine1, city, state` joined.
  - When `selectedId` is provided, resolve it to a location and show its name in the input;
    if it cannot be resolved after load, emit `invalidSelection` and leave the input empty.
- **Accessibility:** mirrors the existing estimate-create typeahead — `role="listbox"` /
  `role="option"`, `aria-expanded`, `aria-autocomplete="list"`, keyboard support
  (arrow/enter/escape), labelled input.

### Page changes (mobile-units, bays, storage-locations)
Each page:

- Renders `<app-location-picker>` at the top, bound to a `locationId` signal.
- **URL sync:** read `?locationId` on init → set the signal and pass as `selectedId`.
  On `locationSelected`, update the signal and call
  `router.navigate([], { queryParams: { locationId }, queryParamsHandling: 'merge' })`.
- **Prompt state:** when `locationId` is empty, render a "Select a location to view/edit …"
  message; no child fetch, no all-locations side effects.
- **On selection (non-empty `locationId`):**
  - `bays` → `listBays(id)`
  - `storage-locations` → `listStorageLocations(id, …)`
  - `mobile-units` → `listMobileUnits()` then filter to `baseLocationId === id`
- **Invalid id:** on `invalidSelection`, show an inline notice
  ("Location not found — select another."), clear the `locationId` signal, strip the bad
  param from the URL, and fall back to the prompt state. No child fetch is attempted.

## Data flow

```
URL ?locationId ──▶ page signal ──(selectedId)──▶ LocationPicker
                                                      │
        page list fetch ◀──(locationSelected)─────────┤
        invalid notice  ◀──(invalidSelection)─────────┘
```

## Error handling

- `getAllLocations()` failure → picker shows an error state; pages stay in prompt state.
- Child list fetch failure → existing per-page error handling (unchanged).
- Invalid / stale `?locationId` → notice + reset to prompt (see above).

## Testing

- `LocationPickerComponent` spec: filters by name/code/address; renders address secondary
  line; emits `locationSelected`; emits `invalidSelection` for an unknown `selectedId`;
  keyboard selection.
- Per-page spec updates: reads `?locationId` on init; prompt shown when empty; selection
  triggers the correct list call and writes the query param; mobile-units filters by
  `baseLocationId`; invalid id shows notice and resets.

## Out of scope

- Backend/SDK changes (all needed APIs exist).
- Server-side `baseLocationId` filtering for mobile units (client-side filter is sufficient
  at current data volumes).
- A global shared component library (the picker lives under the location feature; promote
  later if reused elsewhere).
