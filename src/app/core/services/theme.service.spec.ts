import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let localStorageMock: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  function createService(): ThemeService {
    const injector = createEnvironmentInjector(
      [{ provide: PLATFORM_ID, useValue: 'browser' }],
      TestBed.inject(EnvironmentInjector),
    );
    return runInInjectionContext(injector, () => new ThemeService());
  }

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
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to light and persists an explicit choice', () => {
    const service = createService();
    expect(service.theme()).toBe('light');

    service.set('dark');
    TestBed.tick();

    expect(service.isDark()).toBe(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('durion-theme', 'dark');
  });

  it('toggles between light and dark', () => {
    const service = createService();
    service.toggle();
    TestBed.tick();
    expect(service.theme()).toBe('dark');

    service.toggle();
    TestBed.tick();
    expect(service.theme()).toBe('light');
  });

  it('keeps the chosen theme applied when persisting it throws (quota/disabled storage, ADR-0065 §6)', () => {
    localStorageMock.setItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    const service = createService();

    expect(() => {
      service.set('dark');
      TestBed.tick();
    }).not.toThrow();

    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
