import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtClaims } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';
import { ACCOUNTING_PREFS_STORAGE_PREFIX, AccountingPreferencesService } from './accounting-preferences.service';

const claimsFor = (tid: string | undefined, sub: string): JwtClaims => ({ sub, tid, exp: 4102444800 });

describe('AccountingPreferencesService', () => {
  const claims = signal<JwtClaims | null>(claimsFor('tenant-a', 'clerk'));

  function create(): AccountingPreferencesService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { currentUserClaims: claims, tenantId: computed(() => claims()?.tid ?? null) },
        },
      ],
    });
    return TestBed.inject(AccountingPreferencesService);
  }

  beforeEach(() => {
    localStorage.clear();
    claims.set(claimsFor('tenant-a', 'clerk'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('defaults both preferences to off', () => {
    const service = create();
    expect(service.showTerms()).toBe(false);
    expect(service.startHereDismissed()).toBe(false);
  });

  it('keeps Show accounting terms across a reload for the same tid and sub', () => {
    create().setShowTerms(true);

    expect(localStorage.getItem(`${ACCOUNTING_PREFS_STORAGE_PREFIX}:tenant-a:clerk`)).toBe(
      JSON.stringify({ showTerms: true, startHereDismissed: false }),
    );
    expect(create().showTerms()).toBe(true);
  });

  it('does not show one person’s preference to another sub in the same browser (ADR-0065 §4)', () => {
    create().setShowTerms(true);

    claims.set(claimsFor('tenant-a', 'controller'));
    expect(create().showTerms()).toBe(false);
  });

  it('does not carry a preference across tenants for the same sub', () => {
    create().dismissStartHere();

    claims.set(claimsFor('tenant-b', 'clerk'));
    expect(create().startHereDismissed()).toBe(false);
  });

  it('keeps a dismissed Start here across a reload', () => {
    create().dismissStartHere();
    expect(create().startHereDismissed()).toBe(true);
  });

  it('discards a malformed stored value field by field', () => {
    const key = `${ACCOUNTING_PREFS_STORAGE_PREFIX}:tenant-a:clerk`;
    localStorage.setItem(key, JSON.stringify({ showTerms: 'yes', startHereDismissed: true, extra: 1 }));
    const service = create();
    expect(service.showTerms()).toBe(false);
    expect(service.startHereDismissed()).toBe(true);

    localStorage.setItem(key, '{not json');
    const broken = create();
    expect(broken.showTerms()).toBe(false);
    expect(broken.startHereDismissed()).toBe(false);

    localStorage.setItem(key, '[true]');
    expect(create().showTerms()).toBe(false);
  });

  it('falls back to memory when storage refuses the write, and nothing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const service = create();

    expect(() => service.setShowTerms(true)).not.toThrow();
    expect(service.showTerms()).toBe(true);
  });

  it('falls back to defaults when storage refuses the read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(create().showTerms()).toBe(false);
  });

  it('stores nothing for a token without a tid, keeping the value in memory', () => {
    claims.set(claimsFor(undefined, 'clerk'));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const service = create();

    service.setShowTerms(true);

    expect(setItem).not.toHaveBeenCalled();
    expect(service.showTerms()).toBe(true);
  });
});
