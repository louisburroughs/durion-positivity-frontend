import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** The organization a sign-in last succeeded against, as the login form re-offers it. */
export interface RememberedTenant {
  readonly slug: string;
  readonly displayName: string;
}

const STORAGE_KEY = 'durion.login.tenant';

// arch: non-tenant storage — remembered login form value, browser-only convenience, never an
// authorization input (ADR-0065 §6; see class doc below)

/**
 * LastTenantService
 * -----------------
 * Remembers the organization the user last signed in with, so the login form
 * pre-selects it instead of making them find it again on every visit
 * (ADR-0062 §3).
 *
 * Scope and limits, deliberately:
 * - **This browser only.** Nothing is sent to the server, and nothing follows
 *   the user to another device. The tenant a session actually belongs to still
 *   comes from the access token's `tid` claim; this is a convenience for the
 *   form, never an input to authorization.
 * - **Successful sign-ins only.** A failed attempt is not remembered, so a
 *   mistyped organization does not come back next time.
 * - **No credentials.** The organization name and slug are all that is stored —
 *   never a username, password or token.
 * - **Survives sign-out**, which is the point: the next sign-in is the case
 *   this exists for.
 *
 * Every access is guarded twice: the app server-renders, where `localStorage`
 * does not exist, and in a private window or with site data blocked the
 * accessor itself throws. Either way the form must render as though nothing
 * were remembered.
 */
@Injectable({ providedIn: 'root' })
export class LastTenantService {
  private readonly platformId = inject(PLATFORM_ID);

  /** The remembered organization, or null when there is none to offer. */
  readonly remembered = signal<RememberedTenant | null>(this.read());

  /** Records the organization a sign-in just succeeded against. */
  remember(tenant: RememberedTenant): void {
    this.remembered.set(tenant);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tenant));
    } catch {
      // Private window, blocked site data, or a full quota: the form still works,
      // it just asks again next time.
    }
  }

  /** Forgets it, for "use a different organization". */
  forget(): void {
    this.remembered.set(null);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do: the in-memory signal is already cleared for this page.
    }
  }

  private read(): RememberedTenant | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRememberedTenant(parsed) ? { slug: parsed.slug, displayName: parsed.displayName } : null;
    } catch {
      // Someone else's key, or a half-written value: treat it as nothing remembered.
      return null;
    }
  }
}

/** Storage is attacker-writable in principle, so the shape is checked, not assumed. */
function isRememberedTenant(value: unknown): value is RememberedTenant {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RememberedTenant>;
  return (
    typeof candidate.slug === 'string' &&
    candidate.slug.length > 0 &&
    typeof candidate.displayName === 'string' &&
    candidate.displayName.length > 0
  );
}
