import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { PendingAttempt } from '../models/register-drawer.models';

/**
 * The register's pending drawer movement (CAP:550 S22, story item 6 as amended on #467, §8.2): a
 * record whose outcome is unknown, held in memory only — never in browser storage (ADR-0065) — so
 * that closing the dialog, reopening it or leaving the page never rotates its `requestId`.
 *
 * Root-provided, because the drawer page and its dialog come and go while the attempt must not.
 * It is scoped to the `tid|sub` that sent it and the session the page last resolved: an attempt for
 * any other identity or session is never returned and is dropped as soon as the scope moves.
 */
@Injectable({ providedIn: 'root' })
export class DrawerAttemptStore {
  private readonly auth = inject(AuthService);
  private readonly held = signal<PendingAttempt | null>(null);
  /** The session the drawer page last resolved (null: none, or not yet). */
  private scopeSessionId: string | null = null;

  /** `tid|sub` of the signed-in cashier, each half percent-encoded so neither holds the delimiter. */
  identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  /** The attempt pending on this session for the signed-in cashier, if any. Reactive. */
  pendingFor(sessionId: string | null): PendingAttempt | null {
    const attempt = this.held();
    return attempt && sessionId && attempt.sessionId === sessionId && attempt.identity === this.identity()
      ? attempt
      : null;
  }

  /**
   * The drawer page resolved this session (null: none open). An attempt for another session or
   * another cashier is dropped: it can never be retried against this drawer.
   */
  scopeTo(sessionId: string | null): void {
    this.scopeSessionId = sessionId;
    const attempt = this.held();
    if (attempt && (attempt.sessionId !== sessionId || attempt.identity !== this.identity())) {
      this.held.set(null);
    }
  }

  /** Keeps a record whose outcome is unknown; refused for another cashier or session. */
  hold(attempt: PendingAttempt): void {
    if (attempt.identity !== this.identity() || attempt.sessionId !== this.scopeSessionId) {
      return;
    }
    this.held.set(attempt);
  }

  /** A definite answer for this `requestId` settles it. Another id leaves the held attempt alone. */
  release(requestId: string): void {
    if (this.held()?.requestId === requestId) {
      this.held.set(null);
    }
  }

  /** The cashier or tenant changed: nothing pending survives (ADR-0063 §7). */
  clear(): void {
    this.held.set(null);
  }
}
