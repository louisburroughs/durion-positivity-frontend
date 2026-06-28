import {
  AfterViewInit,
  Directive,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  inject,
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
 */
@Directive({ selector: 'dialog[appModalDialog]', standalone: true })
export class ModalDialogDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLDialogElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Emitted when the user dismisses via the Esc key (native `cancel`). */
  readonly modalCancel = output<void>();

  private readonly onCancel = (event: Event): void => {
    event.preventDefault();
    this.modalCancel.emit();
  };

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    const dialog = this.el.nativeElement;
    dialog.addEventListener('cancel', this.onCancel);
    // Feature-detect + guard: jsdom (unit tests) does not implement showModal().
    if (typeof dialog.showModal === 'function' && !dialog.open) {
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
  }
}
