import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LastTenantService } from './last-tenant.service';

const KEY = 'durion.login.tenant';
const ACME = { slug: 'acme-tire', displayName: 'Acme Tire & Auto' };

/** Builds the service under a chosen platform and localStorage stand-in. */
function build(options: {
  platform?: 'browser' | 'server';
  store?: Partial<Storage>;
} = {}): LastTenantService {
  if (options.store) {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: options.store });
  }
  const injector = createEnvironmentInjector(
    [{ provide: PLATFORM_ID, useValue: options.platform ?? 'browser' }],
    TestBed.inject(EnvironmentInjector),
  );
  return runInInjectionContext(injector, () => new LastTenantService());
}

/** A working in-memory localStorage. */
function memoryStore(seed?: Record<string, string>) {
  const data = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    removeItem: vi.fn((k: string) => void data.delete(k)),
    clear: vi.fn(() => data.clear()),
    read: () => data,
  };
}

/** A localStorage that throws on every access, as a private window can. */
function throwingStore() {
  const boom = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return { getItem: vi.fn(boom), setItem: vi.fn(boom), removeItem: vi.fn(boom), clear: vi.fn(boom) };
}

describe('LastTenantService', () => {
  // Spec files share one browser page: restore the real localStorage after this file.
  let realLocalStorage: PropertyDescriptor | undefined;
  beforeAll(() => {
    realLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  });
  afterAll(() => {
    if (realLocalStorage) Object.defineProperty(globalThis, 'localStorage', realLocalStorage);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStore() });
  });

  it('offers nothing when nothing has been remembered', () => {
    expect(build({ store: memoryStore() }).remembered()).toBeNull();
  });

  it('re-offers the organization a sign-in succeeded against', () => {
    const store = memoryStore();
    build({ store }).remember(ACME);

    expect(build({ store }).remembered()).toEqual(ACME);
    expect(store.read().get(KEY)).toBe(JSON.stringify(ACME));
  });

  it('forgets on request, for "use a different organization"', () => {
    const store = memoryStore({ [KEY]: JSON.stringify(ACME) });
    const service = build({ store });
    expect(service.remembered()).toEqual(ACME);

    service.forget();

    expect(service.remembered()).toBeNull();
    expect(store.read().has(KEY)).toBe(false);
  });

  it('stores the organization and nothing else — no username, no token', () => {
    const store = memoryStore();
    build({ store }).remember(ACME);

    expect(Object.keys(JSON.parse(store.read().get(KEY)!))).toEqual(['slug', 'displayName']);
  });

  describe('when storage is unavailable', () => {
    it('reads as nothing remembered rather than throwing', () => {
      expect(() => build({ store: throwingStore() }).remembered()).not.toThrow();
      expect(build({ store: throwingStore() }).remembered()).toBeNull();
    });

    it('still lets a sign-in complete when the write fails', () => {
      const service = build({ store: throwingStore() });

      expect(() => service.remember(ACME)).not.toThrow();
      // The page keeps working; it simply asks again next time.
      expect(service.remembered()).toEqual(ACME);
    });

    it('still clears when the removal fails', () => {
      const service = build({ store: throwingStore() });
      expect(() => service.forget()).not.toThrow();
      expect(service.remembered()).toBeNull();
    });
  });

  describe('on the server', () => {
    it('never touches localStorage while rendering', () => {
      const store = memoryStore({ [KEY]: JSON.stringify(ACME) });
      const service = build({ platform: 'server', store });

      service.remember(ACME);
      service.forget();

      expect(store.getItem).not.toHaveBeenCalled();
      expect(store.setItem).not.toHaveBeenCalled();
      expect(store.removeItem).not.toHaveBeenCalled();
    });
  });

  describe('when the stored value is not ours', () => {
    it('ignores unparseable content', () => {
      expect(build({ store: memoryStore({ [KEY]: 'not json' }) }).remembered()).toBeNull();
    });

    it('ignores a value of the wrong shape', () => {
      expect(build({ store: memoryStore({ [KEY]: JSON.stringify({ slug: 'acme-tire' }) }) }).remembered()).toBeNull();
      expect(build({ store: memoryStore({ [KEY]: JSON.stringify({ slug: '', displayName: '' }) }) }).remembered())
        .toBeNull();
      expect(build({ store: memoryStore({ [KEY]: JSON.stringify(['acme-tire']) }) }).remembered()).toBeNull();
      expect(build({ store: memoryStore({ [KEY]: 'null' }) }).remembered()).toBeNull();
    });
  });
});
