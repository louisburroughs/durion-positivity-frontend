# Button

Triggers an action; one `.btn` base with a modifier for its weight.

**Use** `.btn--primary` (`--brand-primary`) for the main action of a page or dialog, at most once per view. `.btn--accent` (`--accent-strong`, white text 6.4:1) is the teal CTA for completing a flow (approve, finalise, post). `.btn--secondary` is the tonal companion (`--primary50` fill, `--link-color` text). `.btn--outline` (an `--input-border` edge) and `.btn--ghost` (text only) are for low-emphasis actions like Cancel, Back or Clear. `.btn--danger` (`--functional-error-red`) only for destructive actions, normally inside a confirm dialog.

**Sizes**: default is 36px tall; `.btn--sm` (32px) in table rows and toolbars; `.btn--touch` (44px) on the login form and tablet-first screens.

**The consumer provides** a `<button type="button|submit">` (or an `<a>` for navigation) with a verb-first, sentence-case label: "Create estimate", "Save billing rules". An icon goes before the label as a `material-symbols-rounded` span with `aria-hidden="true"`; an icon-only button needs an `aria-label`.

**States**: hover darkens the fill or adds `--surface-hover`; focus shows a 2px `--input-focus-border` outline offset 2px; disabled is 60% opacity. Prefer native `disabled`; use `aria-disabled="true"` only when the button must stay focusable (to explain why it is unavailable), and then guard the click handler, because `aria-disabled` does not stop click or keyboard activation. Hover styles skip both.

**Don't** put white text on `--brand-accent` (teal-400 is 2.4:1), round buttons into pills, or create page-local button classes.

**Mapping from the app's local vocabularies**: `.btn-primary` → `.btn .btn--primary`; `.btn-secondary` (graphite or `--primary50`) → `.btn .btn--secondary`; `.btn--accent` / `.btn-primary` on `--accent-strong` → `.btn .btn--accent`; `.btn-text`, `.btn-link`, `.btn-ghost` → `.btn .btn--ghost`; `.btn-danger`, `.btn-destructive` → `.btn .btn--danger`.
