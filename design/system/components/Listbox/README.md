# Listbox

The dropdown panel for a combobox, typeahead or picker: `.picker-wrap` around the input, `.picker-dropdown` for the list, `.picker-option` per row.

**The panel** is `--surface-variant` with a `--border-color` edge, `--radius-sm` and a `0 4px 12px rgba(0, 0, 0, 0.12)` shadow, 16rem tall at most and scrolling. Hover and `aria-selected="true"` fill an option with `--primaryA100`; the keyboard-active option (`.picker-option-active`, the `aria-activedescendant` target) adds a 2px `--input-focus-border` outline inside it.

**The consumer provides** the combobox semantics: an input with `role="combobox"`, `aria-autocomplete="list"` (typing filters the suggestions) and `aria-expanded`, plus `aria-controls` only while the list is rendered and `aria-activedescendant` only while an option is active, so neither ever names an element that isn't in the DOM (ADR-0029 §8.9); a `role="listbox"` list; `role="option"` rows with stable ids. Each option shows a `.suggestion-primary` name and an optional `.suggestion-secondary` detail (an id, a phone number). Empty results show one `.picker-no-results` row: "No matching customers".

**Keyboard**: focus stays on the input the whole time; the options are never focused, the active one is named by `aria-activedescendant`.

- **ArrowDown** opens the list if it is closed and moves to the next option, stopping at the last.
- **ArrowUp** moves to the previous option, stopping at the first.
- **Enter** acts only while the list is open: it selects the active option and closes the list. With the list closed or no active option it does nothing, so the form still submits.
- **Escape** closes the list and clears the active option without changing the value.
- **Tab** leaves the field normally, and the list closes on blur.

`CustomerLookup` (`src/app/shared/customer-lookup/`) is the closer reference for `onKeydown`, but neither shared component meets this contract in full yet, so don't copy either wholesale:

- `LocationPicker` (`src/app/shared/location-picker/`) closes the list on Escape without clearing `activeIndex`, so ArrowDown, Escape, Enter selects an option that is no longer shown and blocks the form submit. Clear the active option on Escape and check that the list is open before Enter selects.
- Both templates bind `aria-controls` even while the listbox isn't rendered. Bind it only while the list is in the DOM, as `aria-activedescendant` already is.

The same chrome serves `.typeahead-*` and the LocationPicker; the shared rules live in `src/app/shared/styles/listbox.css`.
