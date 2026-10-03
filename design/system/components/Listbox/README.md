# Listbox

The dropdown panel for a combobox, typeahead or picker: `.picker-wrap` around the input, `.picker-dropdown` for the list, `.picker-option` per row.

**The panel** is `--surface-variant` with a `--border-color` edge, `--radius-sm` and `shadow-dropdown`, 16rem tall at most and scrolling. Hover and `aria-selected="true"` fill an option with `--primaryA100`; the keyboard-active option (`.picker-option-active`, the `aria-activedescendant` target) adds a 2px `--input-focus-border` outline inside it.

**The consumer provides** the combobox semantics: an input with `role="combobox"`, `aria-expanded`, `aria-controls` and `aria-activedescendant`; a `role="listbox"` list; `role="option"` rows with stable ids. Each option shows a `.suggestion-primary` name and an optional `.suggestion-secondary` detail (an id, a phone number). Empty results show one `.picker-no-results` row: "No matching customers".

The same chrome serves `.typeahead-*` and the LocationPicker; the shared rules live in `src/app/shared/styles/listbox.css`.
