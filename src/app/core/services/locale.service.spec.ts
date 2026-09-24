import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

  // Spec files share one browser page, so the real globals must come back after this file:
  // a leaked `navigator` stub (no userAgent) or `localStorage` stub breaks unrelated specs.
  let realLocalStorage: PropertyDescriptor | undefined;
  let realNavigator: PropertyDescriptor | undefined;

  beforeAll(() => {
    realLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  });

  afterAll(() => {
    for (const [name, real] of [
      ['localStorage', realLocalStorage],
      ['navigator', realNavigator],
    ] as const) {
      if (real) Object.defineProperty(globalThis, name, real);
      else delete (globalThis as Record<string, unknown>)[name];
    }
  });

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
    ], TestBed.inject(EnvironmentInjector));

    service = runInInjectionContext(injector, () => new LocaleService());
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
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

  it('keeps the locale active in memory when persisting it throws (quota/disabled storage, ADR-0065 §6)', async () => {
    localStorageMock.setItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    await expect(service.setLocale('fr-FR')).resolves.toBeUndefined();

    expect(translateService.use).toHaveBeenCalledWith('fr-FR');
    expect(service.currentLocale()).toBe('fr-FR');
  });

  it('resolves initialize() with a default when localStorage.getItem throws while reading the persisted locale (storage disabled, ADR-0065 §6)', async () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    await expect(service.initialize()).resolves.toBeUndefined();

    // getPersistedLocale() failed closed to null; falls through to the mocked
    // browser-preferred locale ('en-US') rather than throwing.
    expect(service.currentLocale()).toBe('en-US');
  });

  it('resolves initialize() with a default when the localStorage accessor itself throws (SecurityError)', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });

    try {
      await expect(service.initialize()).resolves.toBeUndefined();
      expect(service.currentLocale()).toBe('en-US');
    } finally {
      // Puts back this file's mock; afterAll restores the real storage.
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});
