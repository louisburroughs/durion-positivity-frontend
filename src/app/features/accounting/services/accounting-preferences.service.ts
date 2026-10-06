import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { AccountingPreferences, DEFAULT_ACCOUNTING_PREFERENCES } from '../models/accounting-home.models';

/** `durion.accounting.prefs:<tid>:<sub>` (story S4, Data requirements). */
export const ACCOUNTING_PREFS_STORAGE_PREFIX = 'durion.accounting.prefs';

/**
 * The accounting workspace's two per-person preferences: **Show accounting
 * terms** and the dismissed **Start here** banner (SPEC-accounting-workspace
 * §5.0, §5.1, §8.2).
 *
 * §8.2 asks for a server-side preference with browser storage as a cache; no
 * backend or SDK offers a per-person preference store, so this keeps them in
 * `localStorage` only (story S4, Spec discrepancy 3): they survive a reload in
 * the same browser, not a change of device.
 *
 * Tenant-scoped storage (ADR-0065 §4, arch rule TEN-06): the key carries the
 * token's `tid` AND `sub` claims, so neither another person nor the same person
 * in another tenant reads these values. Without both claims nothing is stored
 * and the values live in memory only. A stored value is validated field by
 * field (anything else falls back to the default), and a write the browser
 * refuses — private window, quota, storage disabled — is caught and the value
 * kept in memory for this session (ADR-0065 §6, TEN-07). The record is two
 * booleans, so its size is bounded by its shape.
 */
@Injectable({ providedIn: 'root' })
export class AccountingPreferencesService {
  private readonly auth = inject(AuthService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Values set in this session, by storage key ('' when the token carries no tid/sub). */
  private readonly session = signal<Readonly<Record<string, AccountingPreferences>>>({});

  /** The storage key for the signed-in person, or null when the token lacks `tid` or `sub`. */
  private readonly storageKey = computed<string | null>(() => {
    // `auth.tenantId()` IS the token's `tid` claim (AuthService decodes it; ADR-0062), so this key is
    // tid + sub. Read through AuthService because only core and named stores may touch `.tid` (TEN-05).
    const tenant = this.auth.tenantId()?.trim();
    const sub = this.auth.currentUserClaims()?.sub?.trim();
    return tenant && sub ? `${ACCOUNTING_PREFS_STORAGE_PREFIX}:${tenant}:${sub}` : null;
  });

  /** The current person's preferences: this session's values, else the stored ones, else the defaults. */
  readonly preferences = computed<AccountingPreferences>(() => {
    const key = this.storageKey();
    const inSession = this.session()[key ?? ''];
    if (inSession) return inSession;
    return key ? this.read(key) : DEFAULT_ACCOUNTING_PREFERENCES;
  });

  readonly showTerms = computed(() => this.preferences().showTerms);
  readonly startHereDismissed = computed(() => this.preferences().startHereDismissed);

  setShowTerms(showTerms: boolean): void {
    this.update({ ...this.preferences(), showTerms });
  }

  dismissStartHere(): void {
    this.update({ ...this.preferences(), startHereDismissed: true });
  }

  private update(next: AccountingPreferences): void {
    const key = this.storageKey();
    this.session.update(all => ({ ...all, [key ?? '']: next }));
    if (key) this.write(key, next);
  }

  private read(key: string): AccountingPreferences {
    if (!this.browser) return DEFAULT_ACCOUNTING_PREFERENCES;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return DEFAULT_ACCOUNTING_PREFERENCES;
      return validated(JSON.parse(raw));
    } catch {
      return DEFAULT_ACCOUNTING_PREFERENCES;
    }
  }

  private write(key: string, value: AccountingPreferences): void {
    if (!this.browser) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ showTerms: value.showTerms, startHereDismissed: value.startHereDismissed }),
      );
    } catch {
      // Storage refused (private window, quota, disabled): the value stays in memory for this session.
    }
  }
}

/** Field-by-field validation: a field that is not a boolean takes its default. */
function validated(value: unknown): AccountingPreferences {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return {
    showTerms:
      typeof record['showTerms'] === 'boolean' ? record['showTerms'] : DEFAULT_ACCOUNTING_PREFERENCES.showTerms,
    startHereDismissed:
      typeof record['startHereDismissed'] === 'boolean'
        ? record['startHereDismissed']
        : DEFAULT_ACCOUNTING_PREFERENCES.startHereDismissed,
  };
}
