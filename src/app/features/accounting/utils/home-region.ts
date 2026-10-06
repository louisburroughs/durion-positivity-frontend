import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { RegionStatus } from '../models/accounting-home.models';

/**
 * One independently loaded region of the accounting home (story S4,
 * "Loading"): its own read status, its own sequence counter and the key the
 * held data answers.
 *
 * - Only the most recently issued read may write (ADR-0063 §1–2): the
 *   sequence number is captured when the read is issued and compared when it
 *   lands, never re-derived from live state.
 * - A failed re-read keeps the prior data and flips only the status
 *   (ADR-0064 §2); the template says "couldn't refresh" over the kept data.
 * - A 403 marks the region `denied`: the page stops re-reading it until a
 *   later load succeeds (ADR-0064 §6), and its data is no longer shown.
 * - `settled` runs for every read that is current when it lands, success or
 *   failure, so an obligation parked on the region (a focus move after Approve
 *   month) is drained by whichever read answers last (ADR-0063 §4).
 */
export class HomeRegion<T> {
  readonly status = signal<RegionStatus>('PENDING');
  readonly data = signal<T | null>(null);
  readonly denied = signal(false);
  /** The key the current read was issued for. */
  readonly issuedKey = signal<string | null>(null);
  /** The key the held data answers (ADR-0063 §1). */
  readonly dataKey = signal<string | null>(null);

  private seq = 0;
  private subscription: Subscription | null = null;

  constructor(private readonly settled?: (ok: boolean) => void) {}

  /** Issues a read for `key`; any read still in flight is superseded. */
  load(read$: Observable<T>, key: string | null = null): void {
    const seq = ++this.seq;
    this.subscription?.unsubscribe();
    this.issuedKey.set(key);
    this.status.set('PENDING');
    this.subscription = read$.subscribe({
      next: value => this.apply(seq, key, value),
      error: (error: unknown) => this.fail(seq, error),
    });
  }

  /** Drops any read in flight and the held data (the selection it answered went away). */
  reset(): void {
    this.seq++;
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.issuedKey.set(null);
    this.dataKey.set(null);
    this.data.set(null);
    this.denied.set(false);
    this.status.set('PENDING');
  }

  dispose(): void {
    this.seq++;
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private apply(seq: number, key: string | null, value: T): void {
    if (seq !== this.seq) return;
    this.data.set(value);
    this.dataKey.set(key);
    this.denied.set(false);
    this.status.set('OK');
    this.settled?.(true);
  }

  private fail(seq: number, error: unknown): void {
    if (seq !== this.seq) return;
    this.denied.set(error instanceof HttpErrorResponse && error.status === 403);
    this.status.set('FAILED');
    this.settled?.(false);
  }
}
