import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const COLLAPSED_KEY = 'durion-chat-collapsed';

/**
 * ChatUiService
 * -------------
 * Shared collapse state for the shell chat panel. Lives at the root so the
 * dashboard assistant strip (rendered inside the router-outlet) can open the
 * panel when a message is sent, while the shell header toggles it. Collapsed
 * by default; persisted to localStorage.
 */
@Injectable({ providedIn: 'root' })
export class ChatUiService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly _collapsed = signal<boolean>(this.loadCollapsed());

  readonly collapsed = this._collapsed.asReadonly();

  toggle(): void {
    this.setCollapsed(!this._collapsed());
  }

  open(): void {
    this.setCollapsed(false);
  }

  close(): void {
    this.setCollapsed(true);
  }

  private setCollapsed(value: boolean): void {
    this._collapsed.set(value);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(COLLAPSED_KEY, String(value));
    }
  }

  private loadCollapsed(): boolean {
    // Default collapsed (true) on SSR and first visit; only an explicit
    // 'false' in storage keeps the panel open across reloads.
    if (!isPlatformBrowser(this.platformId)) return true;
    return localStorage.getItem(COLLAPSED_KEY) !== 'false';
  }
}
