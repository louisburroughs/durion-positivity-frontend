# Alert

An inline message banner tied to the page or form it sits in: `.alert` plus one tone.

**Use** `.alert-info` for neutral guidance, `.alert-success` after a completed action, `.alert-warning` for something that needs attention but doesn't block, `.alert-error` for a failure the user can fix, `.alert-critical` (solid `--functional-error-red`, white text) only for a blocking system condition such as a closed period. `.alert-soft` is a neutral note on the card colour.

**The consumer provides** the message (one or two sentences: what happened, then what to do), and the element: `<output class="alert alert-success">` for a status that appears after an action (implicit `role="status"`), or `<div role="alert">` for an error that must interrupt. A leading icon is optional and `aria-hidden`.

Every tone uses its `status-<kind>-bg` / `status-<kind>-fg` pair, so it passes AA in both themes; the 4px left edge uses the `functional-*` colour. Don't rebuild alerts from `color-mix()` tints or hard-coded pastels.
