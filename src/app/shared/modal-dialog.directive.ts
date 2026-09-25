import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
  input,
  output,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Promotes a native `<dialog>` to a true modal.
 *
 * Apply to a `<dialog>` that is rendered behind an `@if` toggle: when the
 * element enters the DOM the directive calls `showModal()` (top-layer render,
 * `::backdrop`, focus trap, implicit `aria-modal`), and on teardown it calls
 * `close()`. The native `cancel` event (Esc key) is forwarded as `modalCancel`
 * so the host can clear its visibility signal — without it, Esc would close the
 * dialog element while the `@if` condition still held it open.
 *
 * SSR-safe: `showModal()` is browser-only, but in practice the toggling signal
 * defaults to closed so the host element is never rendered on the server.
 *
 * Backdrop dismissal (ADR-0029 §8.1) is opt-in via `[closeOnBackdrop]="true"` —
 * a native `<dialog>` does not close on backdrop click by itself, and not every
 * modal wants that behavior restored. When enabled, a click is treated as a
 * backdrop click (and emits `modalCancel`, same as Esc) only when
 * `event.target === event.currentTarget`, i.e. the click landed on the dialog
 * element's own box rather than on any descendant. For that check to mean
 * "backdrop, not panel", the host's CSS must give the `<dialog>` element itself
 * zero padding and put all panel chrome (padding, background, border-radius,
 * box-shadow) on an inner wrapper element — otherwise a click on the dialog's
 * own padding would be misread as a backdrop click.
 */
@Directive({ selector: 'dialog[appModalDialog]', standalone: true, host: { '(click)': 'onBackdropClick($event)' } })
export class ModalDialogDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLDialogElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Opt-in: clicking the dialog's own box (the backdrop area, per the CSS
   * contract above) closes it, same as Esc. Defaults to false — most modals
   * converted from hand-rolled markup never had this before and must not gain
   * it silently.
   */
  readonly closeOnBackdrop = input(false);

  /** Emitted when the user dismisses via the Esc key (native `cancel`) or, when `closeOnBackdrop` is set, a backdrop click. */
  readonly modalCancel = output<void>();

  private readonly onCancel = (event: Event): void => {
    event.preventDefault();
    this.modalCancel.emit();
  };

  /**
   * Captured just before `showModal()` so teardown can restore focus explicitly (ADR-0029 §9).
   * The native `close()` call below is documented to do this on its own, but only when the
   * dialog element is still connected and focus is still inside it at the moment `close()` runs —
   * a condition Angular's own removal of the `@if`-gated host element does not reliably guarantee.
   */
  private previouslyFocused: HTMLElement | null = null;

  onBackdropClick(event: MouseEvent): void {
    if (!this.closeOnBackdrop()) return;
    if (event.target !== event.currentTarget) return; // click landed inside the panel content
    this.modalCancel.emit();
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    const dialog = this.el.nativeElement;
    dialog.addEventListener('cancel', this.onCancel);
    // Feature-detect + guard: jsdom (unit tests) does not implement showModal().
    if (typeof dialog.showModal === 'function' && !dialog.open) {
      this.previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      try {
        dialog.showModal();
      } catch {
        /* environment without modal-dialog support — content still renders via @if */
      }
    }
  }

  ngOnDestroy(): void {
    if (!this.isBrowser) return;
    const dialog = this.el.nativeElement;
    dialog.removeEventListener('cancel', this.onCancel);
    if (dialog.open && typeof dialog.close === 'function') {
      try {
        dialog.close();
      } catch {
        /* no-op */
      }
    }
    // Restore focus to the opener explicitly (ADR-0029 §9) rather than depend solely on the
    // native close() fixup, which only runs while the dialog is still connected and still holds
    // focus — not guaranteed once Angular has started tearing the host element down.
    if (this.previouslyFocused && document.contains(this.previouslyFocused)) {
      this.previouslyFocused.focus();
    }
    this.previouslyFocused = null;
  }
}
