import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser, registerLocaleData } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import localeEsUS from '@angular/common/locales/es-US';
import localeEsMX from '@angular/common/locales/es-MX';
import localeFrCA from '@angular/common/locales/fr-CA';
import localeFr from '@angular/common/locales/fr';

// Angular's `formatDate`/`formatNumber` (and the `date`/`number`/`currency`
// pipes) throw NG0701 for any locale without registered CLDR data. 'en-US'
// falls back to Angular's built-in 'en' data for free; the other locales the
// header dropdown offers do not ship registered by default, so every page
// that formats with the user's *chosen* locale (ADR-0030) needs them
// registered once, here, before any component can read `currentLocale()`.
registerLocaleData(localeEsUS, 'es-US');
registerLocaleData(localeEsMX, 'es-MX');
registerLocaleData(localeFrCA, 'fr-CA');
registerLocaleData(localeFr, 'fr-FR');

export const LOCALE_OPTIONS = [
  { code: 'en-US', labelKey: 'SHELL.HEADER.LOCALE.OPTION.EN_US' },
  { code: 'es-US', labelKey: 'SHELL.HEADER.LOCALE.OPTION.ES_US' },
  { code: 'es-MX', labelKey: 'SHELL.HEADER.LOCALE.OPTION.ES_MX' },
  { code: 'fr-CA', labelKey: 'SHELL.HEADER.LOCALE.OPTION.FR_CA' },
  { code: 'fr-FR', labelKey: 'SHELL.HEADER.LOCALE.OPTION.FR_FR' },
] as const;

const SUPPORTED_LOCALES = LOCALE_OPTIONS.map((locale) => locale.code) as [
  (typeof LOCALE_OPTIONS)[number]['code'],
  ...(typeof LOCALE_OPTIONS)[number]['code'][],
];
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// arch: non-tenant storage — UI locale preference, not keyed by tenant or user (ADR-0065 §6)
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly translate = inject(TranslateService);
  private readonly storageKey = 'durion.locale';
  private readonly defaultLocale: SupportedLocale = 'en-US';

  readonly supportedLocales = SUPPORTED_LOCALES;
  readonly localeOptions = LOCALE_OPTIONS;
  readonly currentLocale = signal<SupportedLocale>(this.defaultLocale);

  async initialize(): Promise<void> {
    this.translate.addLangs([...this.supportedLocales]);
    this.translate.setDefaultLang(this.defaultLocale);

    if (!isPlatformBrowser(this.platformId)) {
      // During SSR/build-time extraction, TranslateHttpLoader cannot load assets
      // via relative URL. setDefaultLang() above already establishes 'en-US' as
      // the fallback for TranslateService, so currentLocale is kept in sync with
      // it here. translate.use() is intentionally skipped to avoid HTTP requests.
      this.currentLocale.set(this.defaultLocale);
      return;
    }

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

    try {
      localStorage.setItem(this.storageKey, locale);
    } catch {
      // Quota exceeded or storage disabled: the locale stays active for this
      // page load via currentLocale; it just won't be remembered on reload.
    }
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
