# Alert

An inline message banner tied to the page or form it sits in: `.alert` plus one tone.

**Use** `.alert-info` for neutral guidance, `.alert-success` after a completed action, `.alert-warning` for something that needs attention but doesn't block, `.alert-error` for a failure the user can fix, `.alert-critical` (solid `--functional-error-red`, white text) only for a blocking system condition such as a closed period. `.alert-soft` is a neutral note on the card colour.

**The consumer provides** the message (one or two sentences: what happened, then what to do), and the element: `<output class="alert alert-success">` for a status that appears after an action (implicit `role="status"`), or `<div role="alert">` for an error that must interrupt. A leading icon is optional and `aria-hidden`.

Info, success and error paint `--status-<kind>-bg` with `--status-<kind>-fg` text and a 4px left edge in the matching `--functional-*` colour. Warning uses `--status-warning-fg` for both the text and the edge, not `--functional-warning`. Critical inverts: a solid `--functional-error-red` fill, `--contrastTextColor` text (6.5:1) and a `--status-error-fg` edge. Soft sits on `--cardBackground` with `--currentTextColor` text and a `--border-color` edge. Every tone passes AA in both themes. Don't rebuild alerts from `color-mix()` tints or hard-coded pastels.
