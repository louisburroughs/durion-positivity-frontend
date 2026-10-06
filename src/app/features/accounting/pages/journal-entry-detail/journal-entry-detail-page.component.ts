import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, catchError, map, throwError } from 'rxjs';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { HelpDisclosureComponent } from '../../components/help-disclosure/help-disclosure.component';
import { HomePageState } from '../../models/accounting-home.models';
import { JournalEntry, JournalEntryTraceability } from '../../models/books.models';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { BooksService, toBooksFailure } from '../../services/books.service';
import {
  WhatHappened,
  describeEntry,
  describeText,
  entryStatusKey,
  entryStatusTone,
  isKey,
  sourceTypeKey,
} from '../../utils/books-display';
import { toDatePipeInput } from '../../utils/date-only.util';
import { HomeRegion } from '../../utils/home-region';

/** The reverse dialog (story "State model"): `needs-override` follows a 422 `PERIOD_CLOSED` for an override holder. */
export type ReversePhase = 'editing' | 'submitting' | 'needs-override';

/** Refusals with copy of their own; literal so the i18n check sees every key. */
const REVERSE_ERROR_KEYS: Readonly<Record<string, string>> = {
  JE_ALREADY_REVERSED: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.ALREADY_REVERSED',
  JE_NOT_POSTED: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.NOT_POSTED',
  PERIOD_HARD_LOCKED: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.HARD_LOCKED',
};

/** Refusals meaning the entry changed under the person: re-read it and close the dialog. */
const STALE_CODES: ReadonlySet<string> = new Set(['JE_ALREADY_REVERSED', 'JE_NOT_POSTED']);

/**
 * One journal entry in full (CAP:550 S5; SPEC-accounting-workspace §5.4 item 6,
 * §8.1 row `books/entries/:journalEntryId`): its number, date, status, what
 * happened and source, its lines, its traceability, and Reverse.
 *
 * Routed by id so a reload or a shared link can fetch it, while the page shows
 * only `JE-YYYYMM-n` (P8): related entries are linked by number, never by id.
 *
 * Reverse gates on `accounting:je:reverse` at the control and again in the
 * handler; it is absent without the permission, and `aria-disabled` with the
 * reason for an entry that is reversed or not recorded (P5, ADR-0040 §6a).
 * A 422 `PERIOD_CLOSED` offers the override justification only to a holder of
 * `accounting:period:override`.
 */
@Component({
  selector: 'app-journal-entry-detail-page',
  standalone: true,
  imports: [DatePipe, FormsModule, MoneyPipe, RouterLink, TranslatePipe, ModalDialogDirective, HelpDisclosureComponent],
  templateUrl: './journal-entry-detail-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './journal-entry-detail-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JournalEntryDetailPageComponent {
  private readonly auth = inject(AuthService);
  private readonly books = inject(BooksService);
  private readonly preferences = inject(AccountingPreferencesService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly pageHeading = viewChild<ElementRef<HTMLElement>>('pageHeading');
  private readonly reasonField = viewChild<ElementRef<HTMLTextAreaElement>>('reasonField');
  private readonly overrideField = viewChild<ElementRef<HTMLTextAreaElement>>('overrideField');

  readonly showTerms = this.preferences.showTerms;

  readonly journalEntryId = toSignal(this.route.paramMap.pipe(map(params => params.get('journalEntryId'))), {
    initialValue: this.route.snapshot?.paramMap?.get('journalEntryId') ?? null,
  });

  // ── Page state (ADR-0031): follows the primary read, the entry ─────────────
  readonly state = signal<HomePageState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly entry = new HomeRegion<JournalEntry>(ok => this.settleEntry(ok));
  /** Traceability is an independent region: its failure never fails the page (ADR-0064 §1). */
  readonly trace = new HomeRegion<JournalEntryTraceability>();

  /**
   * The entry answering the route's id, never a previous one (ADR-0063 §1),
   * and never after a 403: refused data stops rendering (ADR-0064 §6).
   */
  readonly entryData = computed(() =>
    this.entry.dataKey() === this.journalEntryId() && !this.entry.denied() ? this.entry.data() : null,
  );
  readonly traceData = computed(() =>
    this.trace.dataKey() === this.journalEntryId() && !this.trace.denied() ? this.trace.data() : null,
  );

  /** The HTTP status of the entry read's failure, keyed by the id it was issued for. */
  private readonly entryFailureStatus = signal<{ id: string; status: number } | null>(null);

  // ── Gates ──────────────────────────────────────────────────────────────
  readonly canReverse = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.journalEntryReverse }));
  readonly canOverride = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.periodOverride }));
  readonly codes = {
    entries: ACCOUNTING_PAGE.journalEntry[0],
    reverse: ACCOUNTING_SECTION.journalEntryReverse[0],
    override: ACCOUNTING_SECTION.periodOverride[0],
  } as const;

  /** Why Reverse is blocked for this entry, or null when it may be reversed (story PROPOSED 8). */
  readonly reverseBlockedKey = computed<string | null>(() => {
    const entry = this.entryData();
    if (!entry) return 'ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.LOADING';
    // A failed re-read keeps the entry on screen, but its status may be out of date (ADR-0064 §2, §4).
    if (this.entry.status() === 'FAILED') return 'ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.REFRESH_FAILED';
    if (this.entry.status() !== 'OK') return 'ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.LOADING';
    switch (entry.status) {
      case 'POSTED':
        return null;
      case 'REVERSED':
        return 'ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.REVERSED';
      case 'DRAFT':
      case 'PENDING':
        return 'ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.NOT_RECORDED';
      default:
        return 'ACCOUNTING.BOOKS.ENTRY.REVERSE.BLOCKED.UNKNOWN';
    }
  });

  // ── Reverse dialog ─────────────────────────────────────────────────────
  readonly dialogOpen = signal(false);
  readonly phase = signal<ReversePhase>('editing');
  readonly reason = signal('');
  readonly overrideJustification = signal('');
  readonly dialogError = signal<{ key: string; params: Readonly<Record<string, unknown>> } | null>(null);
  /** The page's outcome message after the dialog closes; the correcting entry when one was recorded. */
  readonly outcome = signal<{
    key: string;
    params: Readonly<Record<string, unknown>>;
    correction: { journalEntryId: string; entryNumber: string | null } | null;
  } | null>(null);
  private reverseSubscription: Subscription | null = null;

  readonly toDate = toDatePipeInput;
  readonly isKey = isKey;
  readonly statusKey = entryStatusKey;
  readonly statusTone = entryStatusTone;
  readonly sourceKey = sourceTypeKey;

  private trackedIdentity = this.identity();
  private readonly identityTick = signal(0);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.entry.dispose();
      this.trace.dispose();
      this.reverseSubscription?.unsubscribe();
    });
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.entry.reset();
        this.trace.reset();
        this.abandonReverse();
        this.outcome.set(null);
        this.state.set('idle');
        this.errorKey.set(null);
        this.identityTick.update(tick => tick + 1);
      });
    });
    effect(() => {
      const id = this.journalEntryId();
      this.identityTick();
      untracked(() => {
        // A different entry: whatever the dialog and outcome said belonged to the previous one.
        this.abandonReverse();
        this.outcome.set(null);
        this.load(id);
      });
    });
  }

  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  private load(id: string | null): void {
    this.entryFailureStatus.set(null);
    if (!id) {
      this.entry.reset();
      this.trace.reset();
      this.state.set('error');
      this.errorKey.set('ACCOUNTING.BOOKS.ENTRY.NOT_FOUND');
      return;
    }
    if (this.state() !== 'ready' || !this.entryData()) {
      this.state.set('loading');
      this.errorKey.set(null);
    }
    const read = this.books.getJournalEntry(id).pipe(
      catchError((error: unknown) => {
        this.entryFailureStatus.set({ id, status: toBooksFailure(error).status });
        return throwError(() => error);
      }),
    );
    this.entry.load(read, id);
    this.trace.load(this.books.getTraceability(id), id);
  }

  /** Re-reads the entry and its traceability (after a reversal or a stale refusal). */
  reload(): void {
    this.load(this.journalEntryId());
  }

  /**
   * Why the entry is not shown: `NOT_FOUND` for a 404 or a route without an id
   * ("We couldn't find this entry"), `DENIED` for a 403, `FAILED` otherwise
   * (story "Alternate and error flows"; one truthful message per cause, ADR-0064 §4).
   */
  readonly entryFailure = computed<'NOT_FOUND' | 'DENIED' | 'FAILED' | null>(() => {
    const id = this.journalEntryId();
    if (!id) return 'NOT_FOUND';
    if (this.entry.status() !== 'FAILED' || this.entry.issuedKey() !== id) return null;
    if (this.entry.denied()) return 'DENIED';
    const failure = this.entryFailureStatus();
    return failure?.id === id && failure.status === 404 ? 'NOT_FOUND' : 'FAILED';
  });

  /** The entry read answered: `state` moves before `errorKey`, into error and back out (ADR-0031 §1, §5). */
  private settleEntry(ok: boolean): void {
    if (ok) {
      this.state.set('ready');
      this.errorKey.set(null);
      return;
    }
    const failure = this.entryFailure();
    this.state.set('error');
    this.errorKey.set(
      failure === 'NOT_FOUND'
        ? 'ACCOUNTING.BOOKS.ENTRY.NOT_FOUND'
        : failure === 'DENIED'
          ? 'ACCOUNTING.BOOKS.REGION.DENIED'
          : this.entryData()
            ? 'ACCOUNTING.BOOKS.REGION.REFRESH_FAILED'
            : 'ACCOUNTING.BOOKS.ENTRY.LOAD_FAILED',
    );
  }

  whatHappened(entry: JournalEntry): WhatHappened {
    return describeEntry(entry);
  }

  lineText(description: string | null): WhatHappened {
    return describeText(description);
  }

  // ── Reverse ────────────────────────────────────────────────────────────
  openReverse(): void {
    if (!this.canReverse() || this.reverseBlockedKey() !== null) return;
    this.reason.set('');
    this.overrideJustification.set('');
    this.dialogError.set(null);
    this.outcome.set(null);
    this.phase.set('editing');
    this.dialogOpen.set(true);
  }

  cancelReverse(): void {
    if (this.phase() === 'submitting') return;
    this.abandonReverse();
  }

  private abandonReverse(): void {
    this.reverseSubscription?.unsubscribe();
    this.reverseSubscription = null;
    this.dialogOpen.set(false);
    this.phase.set('editing');
    this.dialogError.set(null);
  }

  /** One call per submission; permission, entry state and the reason are re-checked here (ADR-0040 §6a). */
  submitReverse(): void {
    const entry = this.entryData();
    const id = this.journalEntryId();
    if (!this.canReverse() || !entry || !id || this.reverseBlockedKey() !== null || this.phase() === 'submitting') return;
    const reason = this.reason().trim();
    if (!reason) {
      this.dialogError.set({ key: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.REASON_REQUIRED', params: {} });
      this.focusAfterRender(() => this.reasonField()?.nativeElement.focus());
      return;
    }
    const overriding = this.phase() === 'needs-override';
    const justification = this.overrideJustification().trim();
    if (overriding && (!this.canOverride() || !justification)) {
      this.dialogError.set({ key: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.OVERRIDE_REQUIRED', params: {} });
      this.focusAfterRender(() => this.overrideField()?.nativeElement.focus());
      return;
    }
    const entryLabel = entry.entryNumber;
    this.phase.set('submitting');
    this.dialogError.set(null);
    this.reverseSubscription?.unsubscribe();
    this.reverseSubscription = this.books
      .reverseJournalEntry(id, reason, overriding ? justification : undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: correction => {
          // The outcome belongs to the entry it was sent for (ADR-0063 §1).
          if (this.journalEntryId() !== id) return;
          this.abandonReverse();
          this.outcome.set({
            key: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.DONE',
            params: { entry: entryLabel },
            correction: correction.journalEntryId
              ? { journalEntryId: correction.journalEntryId, entryNumber: correction.entryNumber }
              : null,
          });
          this.reload();
          this.focusAfterRender(() => this.pageHeading()?.nativeElement.focus());
        },
        error: (error: unknown) => {
          if (this.journalEntryId() !== id) return;
          this.onReverseError(error, overriding);
        },
      });
  }

  private onReverseError(error: unknown, overriding: boolean): void {
    const failure = toBooksFailure(error);
    if (failure.code && STALE_CODES.has(failure.code)) {
      // Someone else acted: show the served state, not the dialog.
      this.abandonReverse();
      this.outcome.set({ key: REVERSE_ERROR_KEYS[failure.code], params: {}, correction: null });
      this.reload();
      this.focusAfterRender(() => this.pageHeading()?.nativeElement.focus());
      return;
    }
    if (failure.status === 422 && failure.code === 'PERIOD_CLOSED') {
      if (this.canOverride() && !overriding) {
        this.phase.set('needs-override');
        this.dialogError.set({ key: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.PERIOD_CLOSED_OVERRIDE', params: {} });
        this.focusAfterRender(() => this.overrideField()?.nativeElement.focus());
        return;
      }
      this.phase.set(overriding ? 'needs-override' : 'editing');
      this.dialogError.set({
        key: this.canOverride()
          ? 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.PERIOD_CLOSED_REFUSED'
          : 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.PERIOD_CLOSED',
        params: { permission: this.codes.override },
      });
      return;
    }
    this.phase.set(overriding ? 'needs-override' : 'editing');
    if (failure.status === 403) {
      this.dialogError.set({ key: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.FORBIDDEN', params: { permission: this.codes.reverse } });
      return;
    }
    if (failure.status === 404) {
      this.dialogError.set({ key: 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.NOT_FOUND', params: {} });
      return;
    }
    this.dialogError.set({
      key: (failure.code && REVERSE_ERROR_KEYS[failure.code]) || 'ACCOUNTING.BOOKS.ENTRY.REVERSE.ERROR.OTHER',
      params: {},
    });
  }

  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }
}
