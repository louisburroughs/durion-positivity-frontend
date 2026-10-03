# Dialog

A modal for a focused task or a confirmation: a native `<dialog class="dialog" appModalDialog>` with a `.dialog-panel` inside.

**The dialog** is `--cardBackground` with `--radius-md` and `shadow-dialog`, 640px wide at most (`min(640px, 100vw - 2rem)`), over a Blueprint Blue backdrop (`rgb(28 46 72 / 32%)`). The panel pads `--space-6`; the title is an h2 (`section-title`); actions sit right-aligned in `.dialog-actions` with the primary action last.

**The consumer provides** the title, the body (a form, or the consequence of a destructive action stated plainly), and the actions: a ghost Cancel and a verb-first confirm ("Remove Alignment", "Close pay period"). Destructive confirms use `.btn--danger`. A server error renders inside the dialog as `.dialog-error` so the user doesn't lose their input. Render the dialog behind an `@if` and let `appModalDialog` (`src/app/shared/modal-dialog.directive.ts`) call `showModal()`; handle `(modalCancel)` to clear the visibility signal on Escape, and opt into `[closeOnBackdrop]="true"` where a backdrop click should dismiss. The `<dialog>` keeps zero padding and the panel carries the chrome, so the directive can tell a backdrop click from a click inside. Never put `aria-modal` on a `div` (ADR-0029 §8.1). Return focus to the trigger on close.
