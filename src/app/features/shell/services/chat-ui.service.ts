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

  hideHistoryRail(): void {
    this.setHistoryRail(false);
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

  /**
   * Open by default on a wide viewport. On a narrow one the rail covers the whole
   * dialog, so defaulting it open would show a first-time user a history list and
   * no message box at all. A stored preference still wins at any width.
   */
  private loadHistoryRail(): boolean {
    if (!isPlatformBrowser(this.platformId)) return true;
    try {
      const stored = localStorage.getItem(HISTORY_RAIL_KEY);
      if (stored !== null) return stored !== 'false';
    } catch {
      // Storage disabled or throwing: fall back to the same viewport-based
      // default as "no stored preference", never an unconditional `true` —
      // that would open the rail over the composer on a first-time phone user.
      return !isNarrowViewport();
    }
    return !isNarrowViewport();
  }
}

/** True on the breakpoint where the history rail covers the whole dialog. */
export function isNarrowViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 640px)').matches;
}
