import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, computed, effect, inject, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { supplierIdentityKey } from '../utils/supplier-identity.util';

/** Delay before the text lands, so a region created in the same task is already in the accessibility tree. */
const ANNOUNCE_DELAY_MS = 100;
/** How long the sentence stays in the region once announced; it is not page content. */
export const ANNOUNCE_CLEAR_MS = 5000;

/**
 * A polite announcement that survives a route change (CAP:550 S30, #469 item 3).
 *
 * Add vendor navigates away the moment the vendor is created — back to Bills to
 * pay or a draft bill — so a live region inside the page would be destroyed with
 * it and the message lost. This service keeps one `role="status"` region on
 * `document.body`, outside every route outlet, and writes the already-translated
 * text into it. The text is cleared a few seconds later and whenever the
 * signed-in `tid|sub` changes, so it never outlives its moment or its person;
 * nothing is stored (ADR-0065).
 */
@Injectable({ providedIn: 'root' })
export class VendorAnnouncerService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly identity = computed(() => supplierIdentityKey(this.auth.tenantId(), this.auth.currentUserClaims()?.sub));
  private trackedIdentity = this.identity();

  private region: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by every announce and clear; a timer acts only for the announcement that armed it (ADR-0063 §6). */
  private generation = 0;

  constructor() {
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => this.clear());
    });
  }

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
    this.clear();
    const region = this.region;
    const generation = this.generation;
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      if (generation !== this.generation || region !== this.region) return;
      region.textContent = text;
      this.clearTimer = setTimeout(() => {
        this.clearTimer = null;
        if (generation === this.generation && region === this.region) region.textContent = '';
      }, ANNOUNCE_CLEAR_MS);
    }, ANNOUNCE_DELAY_MS);
  }

  /** Empty the region and cancel anything pending. */
  clear(): void {
    this.generation += 1;
    if (this.showTimer !== null) clearTimeout(this.showTimer);
    if (this.clearTimer !== null) clearTimeout(this.clearTimer);
    this.showTimer = null;
    this.clearTimer = null;
    if (this.region) this.region.textContent = '';
  }

  ngOnDestroy(): void {
    this.clear();
    this.region?.remove();
    this.region = null;
  }
}
