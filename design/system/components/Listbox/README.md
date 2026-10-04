# Listbox

The dropdown panel for a combobox, typeahead or picker: `.picker-wrap` around the input, `.picker-dropdown` for the list, `.picker-option` per row.

**The panel** is `--surface-variant` with a `--border-color` edge, `--radius-sm` and a `0 4px 12px rgba(0, 0, 0, 0.12)` shadow, 16rem tall at most and scrolling. Hover and `aria-selected="true"` fill an option with `--primaryA100`; the keyboard-active option (`.picker-option-active`, the `aria-activedescendant` target) adds a 2px `--input-focus-border` outline inside it.

**The consumer provides** the combobox semantics: an input with `role="combobox"` and `aria-expanded`, plus `aria-controls` only while the list is rendered and `aria-activedescendant` only while an option is active, so neither ever names an element that isn't in the DOM (ADR-0029 §8.9); a `role="listbox"` list; `role="option"` rows with stable ids. Each option shows a `.suggestion-primary` name and an optional `.suggestion-secondary` detail (an id, a phone number). Empty results show one `.picker-no-results` row: "No matching customers".

The same chrome serves `.typeahead-*` and the LocationPicker; the shared rules live in `src/app/shared/styles/listbox.css`.
