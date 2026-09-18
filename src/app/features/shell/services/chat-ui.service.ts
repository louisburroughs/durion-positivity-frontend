import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const HISTORY_RAIL_KEY = 'durion-chat-history-rail';

/**
 * ChatUiService
 * -------------
 * Open/closed state for the assistant modal, shared by everything that can open
 * it: the header button, the dashboard launcher and the Ctrl/Cmd+K shortcut.
 *
 * The modal itself is deliberately NOT persisted — a dialog that reopens itself
 * on every page load blocks the page the user actually asked for. The history
 * rail inside it is persisted, because that is a layout preference.
 */
@Injectable({ providedIn: 'root' })
export class ChatUiService {
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _open = signal(false);
  private readonly _historyRailOpen = signal<boolean>(this.loadHistoryRail());

  readonly open = this._open.asReadonly();
  readonly historyRailOpen = this._historyRailOpen.asReadonly();

  openModal(): void {
    this._open.set(true);
  }

  close(): void {
    this._open.set(false);
  }

  toggle(): void {
    this._open.update(open => !open);
  }

  toggleHistoryRail(): void {
    this.setHistoryRail(!this._historyRailOpen());
  }

  showHistoryRail(): void {
    this.setHistoryRail(true);
  }

  private setHistoryRail(value: boolean): void {
    this._historyRailOpen.set(value);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(HISTORY_RAIL_KEY, String(value));
    } catch {
      // Storage disabled or over quota: the preference just does not stick.
    }
  }

  /** Open on SSR and first visit; only an explicit 'false' keeps the rail closed. */
  private loadHistoryRail(): boolean {
    if (!isPlatformBrowser(this.platformId)) return true;
    try {
      return localStorage.getItem(HISTORY_RAIL_KEY) !== 'false';
    } catch {
      return true;
    }
  }
}
