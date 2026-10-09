import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject } from '@angular/core';

/** Delay before the text lands, so a region created in the same task is already in the accessibility tree. */
const ANNOUNCE_DELAY_MS = 100;

/**
 * A polite announcement that survives a route change (CAP:550 S30, #469 item 3).
 *
 * Add vendor navigates away the moment the vendor is created — back to Bills to
 * pay or a draft bill — so a live region inside the page would be destroyed with
 * it and the message lost. This service keeps one `role="status"` region on
 * `document.body`, outside every route outlet, and writes the already-translated
 * text into it. It never holds tenant data beyond the sentence it announces,
 * and nothing is stored (ADR-0065).
 */
@Injectable({ providedIn: 'root' })
export class VendorAnnouncerService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private region: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  announce(text: string): void {
    const body = this.document.body;
    if (!body) return;
    if (!this.region || !this.region.isConnected) {
      const region = this.document.createElement('div');
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('data-testid', 'vendor-announcer');
      region.className = 'sr-only';
      body.appendChild(region);
      this.region = region;
    }
    const region = this.region;
    region.textContent = '';
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      // ADR-0063 §6: only the region this call wrote to, if it is still the live one.
      if (region === this.region) region.textContent = text;
    }, ANNOUNCE_DELAY_MS);
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.region?.remove();
    this.region = null;
  }
}
