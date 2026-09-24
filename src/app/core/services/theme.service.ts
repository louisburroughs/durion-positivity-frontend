import { Injectable, signal, computed, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'durion-theme';

// arch: non-tenant storage — UI theme preference, not keyed by tenant or user (ADR-0065 §6)

/**
 * ThemeService
 * -----------
 * Manages light / dark theme via a CSS `data-theme` attribute on <html>.
 * Preference is persisted to localStorage so it survives page reloads.
 *
 * Usage in components:
 *   themeService.theme()        → 'light' | 'dark'
 *   themeService.toggle()
 *   themeService.set('dark')
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);

  readonly theme = signal<Theme>(this.loadPreference());

  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    // Keep <html data-theme="..."> in sync whenever the signal changes.
    effect(() => {
      const t = this.theme();
      if (isPlatformBrowser(this.platformId)) {
        document.documentElement.dataset['theme'] = t;
        try {
          localStorage.setItem(STORAGE_KEY, t);
        } catch {
          // Quota exceeded or storage disabled: the theme stays applied to the
          // document for this page load; it just won't survive a reload.
        }
      }
    });
  }

  toggle(): void {
    this.theme.update(t => (t === 'light' ? 'dark' : 'light'));
  }

  set(theme: Theme): void {
    this.theme.set(theme);
  }

  private loadPreference(): Theme {
    try {
      if (typeof localStorage === 'undefined') return this.osPreference();
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {
      // Storage disabled (private window, blocked site data) or inaccessible:
      // fall back to OS preference below.
    }
    return this.osPreference();
  }

  /** Respect OS preference when no explicit choice has been saved (or storage is unavailable). */
  private osPreference(): Theme {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
