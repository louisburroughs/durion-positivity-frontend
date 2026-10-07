import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { canAccess } from '../../../../core/security/route-access';
import { ORDER_PAGE, ORDER_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  DrawerMovementDialogComponent,
  DrawerSessionChange,
} from '../../components/drawer-movement-dialog/drawer-movement-dialog.component';
import {
  DrawerDialogKind,
  DrawerMovement,
  DrawerOptions,
  DrawerSession,
  REGISTER_TERMINAL_ID,
  ReadStatus,
  RecordedMovement,
  offeredReasons,
  reasonKey,
} from '../../models/register-drawer.models';
import { RegisterSessionService } from '../../services/register-session.service';

export type DrawerPageState = 'idle' | 'loading' | 'ready' | 'noSession' | 'error';

const STATUS_KEYS: Readonly<Record<string, string>> = {
  OPEN: 'ORDER.DRAWER.STATUS.OPEN',
  CLOSING: 'ORDER.DRAWER.STATUS.CLOSING',
  CLOSED: 'ORDER.DRAWER.STATUS.CLOSED',
};

const NOTICE_KEYS: Readonly<Record<DrawerSessionChange, string>> = {
  GONE: 'ORDER.DRAWER.NOTICE.SESSION_GONE',
  NOT_OPEN: 'ORDER.DRAWER.NOTICE.SESSION_NOT_OPEN',
  CONFLICT: 'ORDER.DRAWER.NOTICE.CONFLICT',
};

/** The polite announcement after a recording: "Recorded: {reason}, {amount}". */
interface Announcement {
  readonly reasonKey: string;
  readonly amount: number;
  readonly currencyCode: string;
}

function isStatus(error: unknown, status: number): boolean {
  return error instanceof HttpErrorResponse && error.status === status;
}

/**
 * The register drawer (CAP:550 S22, `/app/order/drawer`): the terminal's current session, its
 * movements and the **Pay out** and **Change the float** actions.
 *
 * The session, movements and options reads each carry their own sequence, all bumped together on
 * a session change or a `tid|sub` change (ADR-0063); each read keeps a `'PENDING' | 'OK' |
 * 'FAILED'` status and the actions are enabled only while the options read is `'OK'` for the
 * session on screen (ADR-0064). The page gates on `order:session:view` and the actions, their
 * handlers and the options read on `order:session:cash_movement` (ADR-0040 §6a); data stops
 * rendering the moment its permission is gone (ADR-0064 §6). The UI never compares an amount with
 * a limit and shows no running total (P7); served names are shown, never ids (spec discrepancy 3).
 */
@Component({
  selector: 'app-register-drawer-page',
  standalone: true,
  imports: [DatePipe, MoneyPipe, TranslatePipe, DrawerMovementDialogComponent],
  templateUrl: './register-drawer-page.component.html',
  styleUrl: './register-drawer-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterDrawerPageComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(RegisterSessionService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly notice = viewChild<ElementRef<HTMLElement>>('notice');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  readonly state = signal<DrawerPageState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly session = signal<DrawerSession | null>(null);
  /** The latest session read: a re-resolution in flight (after a 404 or 409) is not `'OK'` (ADR-0064). */
  readonly sessionStatus = signal<ReadStatus>('PENDING');
  readonly movements = signal<readonly DrawerMovement[]>([]);
  /** The session the held movements answer (ADR-0063 §1). */
  readonly movementsFor = signal<string | null>(null);
  readonly movementsStatus = signal<ReadStatus>('PENDING');
  readonly options = signal<DrawerOptions | null>(null);
  /** The session the held options answer. */
  readonly optionsFor = signal<string | null>(null);
  readonly optionsStatus = signal<ReadStatus>('PENDING');
  /** The options read answered 403: the actions hide until the session is read again. */
  readonly optionsDenied = signal(false);

  readonly dialogKind = signal<DrawerDialogKind | null>(null);
  readonly announcement = signal<Announcement | null>(null);
  /** Why the dialog closed under the cashier (the session changed); shown in the page's alert. */
  readonly noticeKey = signal<string | null>(null);

  // ── Gates (the unknown-perm_bits case follows canAccess) ────────────────
  readonly canView = computed(() => canAccess(this.auth, { permissions: ORDER_PAGE.drawer }));
  readonly canCashMovement = computed(() => canAccess(this.auth, { permissions: ORDER_SECTION.cashMovement }));

  // ── Views: data renders only while its permission is held (ADR-0064 §6) ─
  readonly sessionView = computed(() => (this.canView() ? this.session() : null));
  readonly movementsView = computed(() => {
    const sessionId = this.sessionView()?.sessionId;
    return sessionId && this.movementsFor() === sessionId ? this.movements() : null;
  });
  readonly optionsView = computed(() => {
    const sessionId = this.sessionView()?.sessionId;
    return this.canCashMovement() && sessionId && this.optionsFor() === sessionId ? this.options() : null;
  });

  readonly isOpen = computed(() => this.sessionView()?.status === 'OPEN');
  readonly isClosing = computed(() => this.sessionView()?.status === 'CLOSING');
  /** The drawer's stamped currency (ADR-0067 PC-14): every amount it holds is in it. */
  readonly currencyCode = computed(() => this.sessionView()?.currencyCode ?? this.optionsView()?.currencyCode ?? null);

  /** Pay out and Change the float exist only on an OPEN drawer, for a holder of the write code. */
  readonly showActions = computed(
    () => this.state() === 'ready' && this.isOpen() && this.canCashMovement() && !this.optionsDenied(),
  );
  /**
   * What the drawer offers is current: the latest session read and the latest options read (every
   * refresh, not only the first) are both `'OK'` for the session on screen (ADR-0064 §1).
   */
  readonly optionsCurrent = computed(
    () => this.sessionStatus() === 'OK' && this.optionsStatus() === 'OK' && !!this.optionsView(),
  );
  private readonly actionable = computed(
    () => this.showActions() && this.optionsCurrent() && !!this.currencyCode(),
  );
  readonly canPayOut = computed(() => this.actionable() && offeredReasons(this.optionsView(), 'PAY_OUT').length > 0);
  readonly canChangeFloat = computed(() => this.actionable() && offeredReasons(this.optionsView(), 'FLOAT').length > 0);

  /** What the open dialog works on; null closes it (an action is only open over an OPEN, readable drawer). */
  readonly dialog = computed(() => {
    const kind = this.dialogKind();
    const sessionId = this.sessionView()?.sessionId;
    const options = this.optionsView();
    const currencyCode = this.currencyCode();
    return kind && sessionId && options && currencyCode && this.showActions()
      ? {
          kind,
          sessionId,
          options,
          currencyCode,
          optionsCurrent: this.optionsCurrent(),
          optionsFailed: this.optionsStatus() === 'FAILED',
        }
      : null;
  });

  readonly reasonKeyOf = reasonKey;

  private sessionSeq = 0;
  private movementsSeq = 0;
  private optionsSeq = 0;
  private sessionSub: Subscription | null = null;
  private movementsSub: Subscription | null = null;
  private optionsSub: Subscription | null = null;
  /** Move focus to the page's notice once the session read it triggered has landed (ADR-0029 §8.7). */
  private focusNoticeAfterRead = false;

  /** The drawer read and the write code as last seen, tracked apart (seeded: not a change). */
  private viewAllowed = this.canView();
  private writeAllowed = this.canCashMovement();

  /** `tid|sub` the held data belongs to; seeded so the effect's first run is not a change. */
  private trackedIdentity = this.identity();

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelReads());
    // ADR-0063 §7: another tenant or person invalidates every read in flight and clears the page.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) {
        return;
      }
      this.trackedIdentity = identity;
      untracked(() => {
        this.resetForIdentity();
        this.loadSession();
      });
    });
    // The drawer read and the write code are tracked apart (ADR-0040 §6a, ADR-0064 §1, §6):
    // - losing either closes the dialog at once, its write lock with it;
    // - losing the read also drops every read in flight and everything held;
    // - regaining either re-reads the session (and options), so nothing acts on data read before
    //   the revocation or on a 403 that no longer holds.
    effect(() => {
      const view = this.canView();
      const write = this.canCashMovement();
      if (view === this.viewAllowed && write === this.writeAllowed) {
        return;
      }
      const regained = (view && !this.viewAllowed) || (view && write && !this.writeAllowed);
      this.viewAllowed = view;
      this.writeAllowed = write;
      untracked(() => {
        if (!view || !write) {
          this.closeDialogKeepingFocus();
        }
        if (!view) {
          this.dropEverything();
          return;
        }
        if (regained) {
          this.optionsDenied.set(false);
          this.loadSession();
        }
      });
    });
    this.loadSession();
  }

  // ── Reads ──────────────────────────────────────────────────────────────
  /** Resolves the terminal's session; every read in flight is superseded. */
  loadSession(): void {
    if (!this.canView()) {
      return;
    }
    const seq = ++this.sessionSeq;
    this.movementsSeq++;
    this.optionsSeq++;
    this.cancelReads();
    this.sessionStatus.set('PENDING');
    if (this.state() !== 'ready') {
      this.state.set('loading');
      this.errorKey.set(null);
    }
    this.sessionSub = this.service.currentSession(REGISTER_TERMINAL_ID).subscribe({
      next: session => this.applySession(session, seq),
      error: () => {
        if (seq !== this.sessionSeq) {
          return;
        }
        this.sessionStatus.set('FAILED');
        this.dialogKind.set(null);
        this.state.set('error');
        this.errorKey.set('ORDER.DRAWER.ERROR.LOAD');
        this.settleNoticeFocus();
      },
    });
  }

  private applySession(session: DrawerSession | null, seq: number): void {
    if (seq !== this.sessionSeq) {
      return;
    }
    this.sessionStatus.set('OK');
    const sessionId = session?.sessionId ?? null;
    if (!session || !sessionId) {
      this.dialogKind.set(null);
      this.clearSessionData();
      this.state.set('noSession');
      this.errorKey.set(null);
      this.settleNoticeFocus();
      return;
    }
    if (sessionId !== this.session()?.sessionId) {
      this.clearSessionData();
    }
    this.session.set(session);
    this.optionsDenied.set(false);
    this.state.set('ready');
    this.errorKey.set(null);
    if (session.status !== 'OPEN') {
      this.dialogKind.set(null);
    }
    this.loadMovements(sessionId);
    if (session.status === 'OPEN') {
      this.loadOptions(sessionId);
    }
    this.settleNoticeFocus();
  }

  private loadMovements(sessionId: string): void {
    const seq = ++this.movementsSeq;
    this.movementsSub?.unsubscribe();
    if (this.movementsFor() !== sessionId) {
      this.movementsStatus.set('PENDING');
    }
    this.movementsSub = this.service.movements(sessionId).subscribe({
      next: rows => {
        if (seq !== this.movementsSeq) {
          return;
        }
        this.movements.set(rows);
        this.movementsFor.set(sessionId);
        this.movementsStatus.set('OK');
      },
      error: (error: unknown) => {
        if (seq !== this.movementsSeq) {
          return;
        }
        if (isStatus(error, 404)) {
          this.loadSession(); // the session is gone: re-resolve it
          return;
        }
        this.movementsStatus.set('FAILED'); // prior good rows stay (ADR-0064 §2)
      },
    });
  }

  private loadOptions(sessionId: string): void {
    if (!this.canCashMovement() || this.optionsDenied()) {
      return; // the read enforces order:session:cash_movement: never call it known-denied (ADR-0064 §6)
    }
    const seq = ++this.optionsSeq;
    this.optionsSub?.unsubscribe();
    // Every refresh, not only the first: held options stay for display (category labels) but are
    // not actionable until the current read answers (ADR-0064 §1).
    this.optionsStatus.set('PENDING');
    this.optionsSub = this.service.options(sessionId).subscribe({
      next: options => {
        if (seq !== this.optionsSeq) {
          return;
        }
        this.options.set(options);
        this.optionsFor.set(sessionId);
        this.optionsStatus.set('OK');
      },
      error: (error: unknown) => {
        if (seq !== this.optionsSeq) {
          return;
        }
        if (isStatus(error, 403)) {
          this.optionsDenied.set(true);
          this.closeDialogKeepingFocus();
          this.optionsStatus.set('FAILED');
          return;
        }
        if (isStatus(error, 404)) {
          this.loadSession();
          return;
        }
        this.optionsStatus.set('FAILED');
      },
    });
  }

  retryMovements(): void {
    const sessionId = this.sessionView()?.sessionId;
    if (sessionId) {
      this.loadMovements(sessionId);
    }
  }

  retryOptions(): void {
    const sessionId = this.sessionView()?.sessionId;
    if (sessionId && this.isOpen()) {
      this.loadOptions(sessionId);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────
  openPayOut(): void {
    if (!this.canPayOut()) {
      return; // re-checked here, not only at the control (ADR-0040 §6a)
    }
    this.openDialog('PAY_OUT');
  }

  openFloatChange(): void {
    if (!this.canChangeFloat()) {
      return;
    }
    this.openDialog('FLOAT');
  }

  private openDialog(kind: DrawerDialogKind): void {
    this.announcement.set(null);
    this.noticeKey.set(null);
    this.dialogKind.set(kind);
  }

  onRecorded(recorded: RecordedMovement): void {
    this.dialogKind.set(null);
    this.announcement.set({
      reasonKey: reasonKey(recorded.reason),
      amount: recorded.amount,
      currencyCode: recorded.currencyCode,
    });
    this.rereadDrawer();
  }

  /** Closed without a confirmed recording: re-read, since a request may have landed meanwhile. */
  onCancelled(): void {
    this.dialogKind.set(null);
    this.rereadDrawer();
  }

  onSessionChanged(change: DrawerSessionChange): void {
    this.dialogKind.set(null);
    this.noticeKey.set(NOTICE_KEYS[change]);
    this.focusNoticeAfterRead = true;
    this.loadSession();
  }

  onOptionsStale(): void {
    const sessionId = this.sessionView()?.sessionId;
    if (sessionId && this.isOpen()) {
      this.loadOptions(sessionId);
    }
  }

  statusKey(status: string | undefined): string {
    return (status && STATUS_KEYS[status]) || 'ORDER.DRAWER.STATUS.UNKNOWN';
  }

  directionKey(movement: DrawerMovement): string {
    switch (movement.movementType) {
      case 'PAID_IN':
        return 'ORDER.DRAWER.DIRECTION.IN';
      case 'PAID_OUT':
        return 'ORDER.DRAWER.DIRECTION.OUT';
      default:
        return 'ORDER.DRAWER.DIRECTION.UNKNOWN'; // never guessed from a missing or unknown direction
    }
  }

  /** A category's served label while the options hold it; otherwise its code (never an id). */
  categoryLabel(code: string): string {
    return this.optionsView()?.categories.find(category => category.code === code)?.label ?? code;
  }

  hasDetails(movement: DrawerMovement): boolean {
    return !!(
      movement.categoryCode ||
      movement.vendorId ||
      movement.reason === 'VENDOR_COD' ||
      movement.bagNumber ||
      movement.receiptReference ||
      movement.note
    );
  }

  private rereadDrawer(): void {
    const sessionId = this.sessionView()?.sessionId;
    if (!sessionId) {
      return;
    }
    this.loadMovements(sessionId);
    if (this.isOpen()) {
      this.loadOptions(sessionId);
    }
  }

  /**
   * Closes the dialog when the actions themselves are going away (a permission lost, the options
   * refused). The opener goes too, so the dialog cannot hand focus back to it: focus lands on the
   * page heading instead of falling to the document body (ADR-0029 §8.7).
   */
  private closeDialogKeepingFocus(): void {
    const host = this.host.nativeElement;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    const focusWasOnPage = !!active && active !== document.body && host.contains(active);
    this.dialogKind.set(null);
    if (!focusWasOnPage) {
      return;
    }
    setTimeout(() => {
      const now = document.activeElement;
      if (!now || now === document.body || !host.contains(now)) {
        this.heading()?.nativeElement.focus();
      }
    });
  }

  private settleNoticeFocus(): void {
    if (!this.focusNoticeAfterRead) {
      return;
    }
    this.focusNoticeAfterRead = false;
    // The dialog and possibly its trigger are gone: land on the notice that explains why.
    setTimeout(() => this.notice()?.nativeElement.focus());
  }

  private clearSessionData(): void {
    this.session.set(null);
    this.movements.set([]);
    this.movementsFor.set(null);
    this.movementsStatus.set('PENDING');
    this.options.set(null);
    this.optionsFor.set(null);
    this.optionsStatus.set('PENDING');
    this.optionsDenied.set(false);
  }

  private cancelReads(): void {
    this.sessionSub?.unsubscribe();
    this.movementsSub?.unsubscribe();
    this.optionsSub?.unsubscribe();
    this.sessionSub = this.movementsSub = this.optionsSub = null;
  }

  /** Invalidates every read in flight and drops everything held (identity change, read lost). */
  private dropEverything(): void {
    this.sessionSeq++;
    this.movementsSeq++;
    this.optionsSeq++;
    this.cancelReads();
    this.dialogKind.set(null);
    this.clearSessionData();
    this.sessionStatus.set('PENDING');
    this.state.set('idle');
    this.errorKey.set(null);
  }

  private resetForIdentity(): void {
    this.dropEverything();
    this.announcement.set(null);
    this.noticeKey.set(null);
    this.focusNoticeAfterRead = false;
  }

  /** `tid|sub`, each half percent-encoded so no value can contain the delimiter. */
  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }
}
