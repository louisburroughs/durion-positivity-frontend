import { WritableSignal } from '@angular/core';
import { Observable, catchError, finalize, map, of, switchMap, tap } from 'rxjs';

/**
 * Callbacks for one correction's re-read (ADR-0063 §4-5). `onReloadSuccess`/
 * `onReloadError` are invoked only when this reload is still the most recently
 * issued one for this coordinator instance; a superseded reload never touches
 * page state, but still releases its own record's pending flag.
 */
export interface CorrectionReloadOptions<T> {
  /** The re-read observable (e.g. `service.listAuditRecords(jobId, ...)`), issued after `submit$` resolves. */
  readonly reload$: Observable<T>;
  /** Applies a re-read result that is still current. */
  readonly onReloadSuccess: (result: T) => void;
  /** Applies a re-read failure that is still current. */
  readonly onReloadError?: () => void;
  /**
   * Applied synchronously if `submit$` itself errors — no reload is issued in that case.
   * Mandatory: `submitCorrection()` turns a server `REJECTED` result into an Observable
   * error (`CorrectionRejectedError`), so an omitted handler would let a rejection vanish
   * with no localized signal (Copilot #4105840870). Callers must show a localized error —
   * never the server's `rejectionReason` text.
   */
  readonly onSubmitError: (error: unknown) => void;
}

/**
 * Coordinates the bulk-import correction -> re-read -> pending-release flow shared
 * by the job-detail page and the eight domain wizard pages (Copilot #4105525874 and
 * siblings, ADR-0063 §4-5).
 *
 * A record's id stays in the caller's `pendingIds` signal until the re-read issued
 * for ITS correction settles — success or failure — so a resubmission can never
 * observe the row as free while its own round trip is still in flight. `reloadSeq`
 * follows this codebase's request-sequence idiom (see `pick-execute-page.component`'s
 * `tasksReadSeq`): only the most recently issued reload is allowed to apply its
 * result to page state, so two concurrent corrections' re-reads can never land out
 * of order and overwrite newer audit data; a superseded reload still releases its
 * own record's pending flag so the guard can never get stuck (per the "Clearing a
 * pending guard on any landing read" mistake in AGENTS.md).
 *
 * One instance per page (constructed alongside the page's `correctionPendingIds`
 * signal) — the sequence counter is not meant to be shared across pages.
 */
export class BulkImportCorrectionReloader {
  private reloadSeq = 0;

  constructor(private readonly pendingIds: WritableSignal<Set<string>>) {}

  /**
   * Submits `submit$` for `recordId`, then — only if it succeeds — issues the
   * reload described by `options` and waits for it to settle before releasing
   * `recordId` from `pendingIds`. Subscribe the returned Observable (typically
   * with `takeUntilDestroyed`); it never errors.
   */
  run<T>(recordId: string, submit$: Observable<void>, options: CorrectionReloadOptions<T>): Observable<void> {
    this.addPending(recordId);

    return submit$.pipe(
      switchMap(() => this.reload(recordId, options)),
      catchError(error => {
        options.onSubmitError(error);
        this.removePending(recordId);
        return of(undefined);
      }),
    );
  }

  private reload<T>(recordId: string, options: CorrectionReloadOptions<T>): Observable<void> {
    const seq = ++this.reloadSeq;

    return options.reload$.pipe(
      tap({
        next: result => {
          if (seq === this.reloadSeq) { options.onReloadSuccess(result); }
        },
        error: () => {
          if (seq === this.reloadSeq) { options.onReloadError?.(); }
        },
      }),
      map(() => undefined),
      catchError(() => of(undefined)),
      finalize(() => this.removePending(recordId)),
    );
  }

  private addPending(recordId: string): void {
    this.pendingIds.update(s => { const n = new Set(s); n.add(recordId); return n; });
  }

  private removePending(recordId: string): void {
    this.pendingIds.update(s => { const n = new Set(s); n.delete(recordId); return n; });
  }
}
