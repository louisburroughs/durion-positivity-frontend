import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

const SUPPORTED_LOCALES = ['en-US', 'es-US', 'fr-CA'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly translate = inject(TranslateService);
  private readonly storageKey = 'durion.locale';
  private readonly defaultLocale: SupportedLocale = 'en-US';

  readonly supportedLocales = SUPPORTED_LOCALES;
  readonly currentLocale = signal<SupportedLocale>(this.defaultLocale);

  async initialize(): Promise<void> {
    this.translate.addLangs([...this.supportedLocales]);
    this.translate.setDefaultLang(this.defaultLocale);

    const initialLocale = this.resolveInitialLocale();
    await this.applyLocale(initialLocale);
  }

  async setLocale(locale: string): Promise<void> {
    if (!this.isSupportedLocale(locale)) {
      return;
    }

    await this.applyLocale(locale);
  }

  private async applyLocale(locale: SupportedLocale): Promise<void> {
    try {
      await firstValueFrom(this.translate.use(locale));
      this.currentLocale.set(locale);
      this.persistLocale(locale);
    } catch {
      if (locale !== this.defaultLocale) {
        await firstValueFrom(this.translate.use(this.defaultLocale));
      }
      this.currentLocale.set(this.defaultLocale);
      this.persistLocale(this.defaultLocale);
    }
  }

  private resolveInitialLocale(): SupportedLocale {
    const persisted = this.getPersistedLocale();
    if (persisted) {
      return persisted;
    }

    const browserPreferred = this.getBrowserPreferredLocale();
    if (browserPreferred) {
      return browserPreferred;
    }

    return this.defaultLocale;
  }

  private getPersistedLocale(): SupportedLocale | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    return this.normalizeLocale(localStorage.getItem(this.storageKey));
  }

  private persistLocale(locale: SupportedLocale): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    localStorage.setItem(this.storageKey, locale);
  }

  private getBrowserPreferredLocale(): SupportedLocale | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    const browserLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const locale of browserLocales) {
      const normalized = this.normalizeLocale(locale);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private normalizeLocale(candidate: string | null | undefined): SupportedLocale | null {
    if (!candidate) {
      return null;
    }

    const direct = this.supportedLocales.find(
      (locale) => locale.toLowerCase() === candidate.toLowerCase(),
    );
    if (direct) {
      return direct;
    }

    const primaryLanguage = candidate.split('-')[0]?.toLowerCase();
    if (!primaryLanguage) {
      return null;
    }

    return this.supportedLocales.find((locale) => locale.toLowerCase().startsWith(`${primaryLanguage}-`)) ?? null;
  }

  private isSupportedLocale(locale: string): locale is SupportedLocale {
    return this.supportedLocales.includes(locale as SupportedLocale);
  }
}
