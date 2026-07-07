import '@angular/compiler';
import { createEnvironmentInjector, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  let service: LocaleService;
  let translateService: {
    addLangs: ReturnType<typeof vi.fn>;
    setDefaultLang: ReturnType<typeof vi.fn>;
    use: ReturnType<typeof vi.fn>;
  };
  let localStorageMock: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      clear: vi.fn(),
    };

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        language: 'en-US',
        languages: ['en-US'],
      },
    });

    localStorage.clear();

    translateService = {
      addLangs: vi.fn(),
      setDefaultLang: vi.fn(),
      use: vi.fn((locale: string) => of({ locale })),
    };

    const injector = createEnvironmentInjector([
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: TranslateService, useValue: translateService },
    ], null);

    service = runInInjectionContext(injector, () => new LocaleService());
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('registers all locales offered by the header dropdown', async () => {
    await service.initialize();

    expect(translateService.addLangs).toHaveBeenCalledWith([
      'en-US',
      'es-US',
      'es-MX',
      'fr-CA',
      'fr-FR',
    ]);
  });

  it('applies mexico spanish when selected explicitly', async () => {
    await service.setLocale('es-MX');

    expect(translateService.use).toHaveBeenCalledWith('es-MX');
    expect(service.currentLocale()).toBe('es-MX');
    expect(localStorage.setItem).toHaveBeenCalledWith('durion.locale', 'es-MX');
  });

  it('applies france french when selected explicitly', async () => {
    await service.setLocale('fr-FR');

    expect(translateService.use).toHaveBeenCalledWith('fr-FR');
    expect(service.currentLocale()).toBe('fr-FR');
    expect(localStorage.setItem).toHaveBeenCalledWith('durion.locale', 'fr-FR');
  });
});
