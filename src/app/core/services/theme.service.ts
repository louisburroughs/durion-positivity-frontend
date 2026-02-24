import { Injectable, signal, computed, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'durion-theme';

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
        localStorage.setItem(STORAGE_KEY, t);
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
    if (typeof localStorage === 'undefined') return 'light';
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
    // Respect OS preference when no explicit choice has been saved.
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
