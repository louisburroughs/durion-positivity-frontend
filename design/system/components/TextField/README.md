# TextField

A labelled input, select or textarea: a `.field` wrapper with a label, the control, and an optional hint or error.

**Global defaults** style every `input`, `select` and `textarea`: `--input-background` fill, a 1px `--input-border` outline (4.4:1 light, 3.7:1 dark), `--radius-sm`, 0.9375rem Noto Sans. Focus switches the border to `--input-focus-border` with a 3px halo of it at 20%. Readonly fields sit on `--surface-inset`.

**The consumer provides** a `<label for>` above the control (sentence case, 0.85rem medium), the control with a stable `id`, a `.required-mark` (`*`) for required fields, and either a `.field-hint` (in `--text-muted`) or, after validation, a `.field-error` linked with `aria-describedby` and the control set to `aria-invalid="true"` (border turns `--status-error-fg`, which holds 3:1 on the field in both themes). Placeholders show a format, never the label.

**Ledger variant**: `.field__input--ledger` drops the box for a 2px underline; the CRM search and intake forms use it. Its focus underline is `--accentA700`.

Put short fields side by side in `.field-row`, which stacks to one column on narrow screens.
