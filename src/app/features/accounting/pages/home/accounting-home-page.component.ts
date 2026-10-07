import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { LandingSectionsComponent } from '../../../../shared/landing/landing-sections/landing-sections.component';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { HelpDisclosureComponent } from '../../components/help-disclosure/help-disclosure.component';
import { TodoDetailPanelComponent } from '../../components/todo-detail-panel/todo-detail-panel.component';
import {
  BankCheckupRow,
  CheckupAwaitingApproval,
  CheckupStatus,
  HomePageState,
  PayablesLane,
  PaymentsToMatchPage,
  ReceivablesLane,
  TODO_PAGE_SIZE,
  TodoFilter,
  TodoItem,
  TodoSourcePage,
  UnexplainedBankLine,
} from '../../models/accounting-home.models';
import { ReconciliationReview } from '../../models/bank-reconciliation.models';
import { AccountingPeriod, periodCodeOf } from '../../models/period-close.models';
import { AccountingHomeService } from '../../services/accounting-home.service';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { toBankRecFailure } from '../../services/bank-reconciliation.service';
import { PeriodCloseService } from '../../services/period-close.service';
import { ReconciliationWorkspaceService } from '../../services/reconciliation-workspace.service';
import { toDatePipeInput } from '../../utils/date-only.util';
import { toIsoDate } from '../../utils/date-window.util';
import { HomeRegion } from '../../utils/home-region';
import { ACCOUNTING_LANDING_CONFIG } from '../landing/accounting-landing.config';

/** The home's clock. Tests inject a fixed instant; "today" is re-read from it on every load (ADR-0038). */
export const ACCOUNTING_HOME_CLOCK = new InjectionToken<() => Date>('ACCOUNTING_HOME_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** Below this width the detail panel stacks under the list and takes focus on selection (§5.7). */
export const SMALL_SCREEN_QUERY = '(width <= 767px)';

/** Approve month refusals with copy of their own; literal so the i18n check sees every key. */
const APPROVE_ERROR_KEYS: Readonly<Record<string, string>> = {
  RECONCILIATION_SELF_APPROVAL: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.SELF_APPROVAL',
  RECONCILIATION_NOT_SUBMITTED: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.NOT_SUBMITTED',
  RECONCILIATION_NOT_BALANCED: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.NOT_BALANCED',
  RECONCILIATION_HAS_UNEXPLAINED_ITEMS: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.HAS_UNEXPLAINED_ITEMS',
  RECONCILIATION_ALREADY_FINALIZED: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.ALREADY_FINALIZED',
  OPTIMISTIC_LOCK: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.OPTIMISTIC_LOCK',
};

/** Refusals meaning someone else acted: the list and the review are re-read. */
const APPROVE_STALE_CODES: ReadonlySet<string> = new Set([
  'OPTIMISTIC_LOCK',
  'RECONCILIATION_NOT_SUBMITTED',
  'RECONCILIATION_NOT_BALANCED',
  'RECONCILIATION_HAS_UNEXPLAINED_ITEMS',
  'RECONCILIATION_ALREADY_FINALIZED',
]);

/** Plain-language check-up status keys (§5.1); literal so the i18n check sees every key. */
const CHECKUP_STATUS_KEYS: Readonly<Record<CheckupStatus, string>> = {
  NOT_STARTED: 'ACCOUNTING.HOME.LANES.BANK.STATUS.NOT_STARTED',
  IN_PROGRESS: 'ACCOUNTING.HOME.LANES.BANK.STATUS.IN_PROGRESS',
  SUBMITTED: 'ACCOUNTING.HOME.LANES.BANK.STATUS.SUBMITTED',
  FINALIZED: 'ACCOUNTING.HOME.LANES.BANK.STATUS.FINALIZED',
  UNKNOWN: 'ACCOUNTING.HOME.LANES.BANK.STATUS.UNKNOWN',
};

/** The glossary of the Help guide (§5.1 item 2), in order. */
export const GLOSSARY_WORDS = [
  'BILL',
  'INVOICE',
  'MATCHING',
  'WAITING_DEPOSIT',
  'CREDIT',
  'BANK_CHECKUP',
  'REVERSE',
  'MONTH_CLOSED',
] as const;

type RegionKey = 'period' | 'receivables' | 'payables' | 'bank' | 'payments' | 'bankLines' | 'approvals';

/** A local `YYYY-MM-DD` comparison: inside the period's inclusive date range. */
function contains(period: AccountingPeriod, isoDay: string): boolean {
  return !!period.startDate && !!period.endDate && period.startDate <= isoDay && isoDay <= period.endDate;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The accounting home (CAP:550 S4; SPEC-accounting-workspace §5.1, §8.1 row `''`),
 * replacing the landing page: header with the period chip, Start here, the
 * Help guide, three money lanes, the to-do list v1 with its detail panel, and
 * "More accounting tools" (story Spec discrepancy 2).
 *
 * Every region loads in parallel with its own `PENDING | OK | FAILED` status
 * and sequence counter ({@link HomeRegion}), and is read only when the session
 * holds the code its read needs (`ACCOUNTING_SECTION.home*`); a region the
 * session cannot use is absent, not empty. The page is `ready` once the first
 * round of permitted reads settles and `error` only when every one failed.
 *
 * The UI adds no money (P7): totals, buckets, balances and the waiting count
 * come from the server and render through `MoneyPipe`; bar widths are display
 * geometry from served amounts. Approve month gates on
 * `accounting:reconciliation:approve` at the control and again in the
 * handler, and on the served `canApprove` (P5, ADR-0040 §6a). Its refusals
 * are announced in the panel's live region and re-read the list (ADR-0031 §4):
 * the home stays usable.
 */
@Component({
  selector: 'app-accounting-home-page',
  standalone: true,
  imports: [
    DatePipe,
    MoneyPipe,
    RouterLink,
    TranslatePipe,
    MaterialSymbolPipe,
    HelpDisclosureComponent,
    TodoDetailPanelComponent,
    LandingSectionsComponent,
  ],
  templateUrl: './accounting-home-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './accounting-home-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountingHomePageComponent {
  private readonly auth = inject(AuthService);
  private readonly home = inject(AccountingHomeService);
  private readonly periods = inject(PeriodCloseService);
  private readonly workspace = inject(ReconciliationWorkspaceService);
  private readonly preferences = inject(AccountingPreferencesService);
  private readonly clock = inject(ACCOUNTING_HOME_CLOCK);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly panel = viewChild(TodoDetailPanelComponent);
  private readonly todoHeading = viewChild<ElementRef<HTMLElement>>('todoHeading');
  private readonly pageHeading = viewChild<ElementRef<HTMLElement>>('pageHeading');
  private readonly helpGuideHeading = viewChild<ElementRef<HTMLElement>>('helpGuideHeading');

  // ── Page state (ADR-0031) ──────────────────────────────────────────────
  readonly state = signal<HomePageState>('idle');
  readonly errorKey = signal<string | null>(null);

  /** Local today, re-read on every load and refresh (ADR-0038). */
  readonly today = signal(startOfLocalDay(this.clock()));

  // ── Gates (ACCOUNTING_SECTION; the unknown-perm_bits case follows canAccess) ──
  readonly canSeePeriod = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.homePeriodChip }));
  readonly canSeeReceivables = computed(() =>
    canAccess(this.auth, { permissions: ACCOUNTING_SECTION.homeReceivablesLane }),
  );
  readonly canSeePayables = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.homePayablesLane }));
  readonly canSeeBank = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.homeBankLane }));
  readonly canSeePayments = computed(() =>
    canAccess(this.auth, { permissions: ACCOUNTING_SECTION.homePaymentsToMatch }),
  );
  readonly canSeeBankLines = computed(() =>
    canAccess(this.auth, { allPermissions: ACCOUNTING_SECTION.homeBankLineItems }),
  );
  readonly canSeeApprovals = computed(() =>
    canAccess(this.auth, { allPermissions: ACCOUNTING_SECTION.homeApprovalItems }),
  );
  /** Approve month: the write's own code, never the list's read (ADR-0040 §6a.1). */
  readonly canApproveReconciliation = computed(() =>
    canAccess(this.auth, { permissions: ACCOUNTING_SECTION.reconciliationApprove }),
  );
  readonly canOpenBills = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_PAGE.vendorInvoices }));
  /**
   * "Who owes what" on the Money owed lane opens Your books on that tab (CAP:550 S5). Gated on the
   * tab's own read (`generateAgedReceivables`), not the page's any-of gate, which `accounting:je:view` alone passes.
   */
  readonly canOpenWhoOwesWhat = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.booksSummary }));
  /** "Match customer payments" and the to-do's "more payments" link open Customer payments (CAP:550 S6). */
  readonly canOpenCustomerPayments = computed(() =>
    canAccess(this.auth, { permissions: ACCOUNTING_PAGE.customerPayments }),
  );
  readonly canOpenVendorPayments = computed(() =>
    canAccess(this.auth, { permissions: ACCOUNTING_PAGE.vendorPaymentView }),
  );
  /** The codes a denied region names (ADR-0064 §6). */
  readonly codes = {
    reporting: ACCOUNTING_SECTION.homeReceivablesLane[0],
    reconciliationView: ACCOUNTING_SECTION.homeBankLane[0],
    paymentApply: ACCOUNTING_SECTION.homePaymentsToMatch[0],
  } as const;
  readonly hasMoneyLanes = computed(() => this.canSeeReceivables() || this.canSeePayables() || this.canSeeBank());
  readonly hasTodoSources = computed(() => this.canSeePayments() || this.canSeeBankLines() || this.canSeeApprovals());

  // ── Regions ────────────────────────────────────────────────────────────
  readonly period = new HomeRegion<AccountingPeriod[]>(() => this.settlePage());
  readonly receivables = new HomeRegion<ReceivablesLane>(() => this.settlePage());
  readonly payables = new HomeRegion<PayablesLane>(() => this.settlePage());
  readonly bank = new HomeRegion<BankCheckupRow[]>(() => this.settlePage());
  readonly payments = new HomeRegion<PaymentsToMatchPage>(() => this.onTodoSourceSettled());
  readonly bankLines = new HomeRegion<TodoSourcePage<UnexplainedBankLine>>(() => this.onTodoSourceSettled());
  readonly approvals = new HomeRegion<TodoSourcePage<CheckupAwaitingApproval>>(() => this.onTodoSourceSettled());
  /** The selected approval item's review; keyed by its reconciliation id. */
  readonly review = new HomeRegion<ReconciliationReview>();

  private readonly regions: Readonly<Record<RegionKey, HomeRegion<unknown>>> = {
    period: this.period,
    receivables: this.receivables,
    payables: this.payables,
    bank: this.bank,
    payments: this.payments,
    bankLines: this.bankLines,
    approvals: this.approvals,
  };

  /** Regions this session may read, in load order. */
  private readonly permittedRegions = computed<RegionKey[]>(() => {
    const keys: RegionKey[] = [];
    if (this.canSeePeriod()) keys.push('period');
    if (this.canSeeReceivables()) keys.push('receivables');
    if (this.canSeePayables()) keys.push('payables');
    if (this.canSeeBank()) keys.push('bank');
    if (this.canSeePayments()) keys.push('payments');
    if (this.canSeeBankLines()) keys.push('bankLines');
    if (this.canSeeApprovals()) keys.push('approvals');
    return keys;
  });

  // ── Preferences, Start here, Help guide ───────────────────────────────
  readonly showTerms = this.preferences.showTerms;
  readonly startHereDismissed = this.preferences.startHereDismissed;
  readonly helpOpen = signal(false);
  readonly glossary = GLOSSARY_WORDS;
  readonly landingSections = ACCOUNTING_LANDING_CONFIG.sections;

  // ── Period chip ───────────────────────────────────────────────────────
  /** The period containing today, from a successful read only. */
  readonly currentPeriod = computed<AccountingPeriod | null>(() => {
    if (this.period.status() !== 'OK') return null;
    const isoDay = toIsoDate(this.today());
    return this.period.data()?.find(period => contains(period, isoDay)) ?? null;
  });

  // ── To-do list ────────────────────────────────────────────────────────
  readonly filter = signal<TodoFilter>('ALL');
  readonly selectedId = signal<string | null>(null);

  /** Items held, from sources the session can act on; a denied source contributes nothing. */
  readonly todoItems = computed<TodoItem[]>(() => [
    ...this.sourceItems(this.payments, this.canSeePayments()).map(
      (payment): TodoItem => ({ kind: 'PAYMENT', id: `PAYMENT:${payment.paymentId}`, payment }),
    ),
    ...this.sourceItems(this.bankLines, this.canSeeBankLines()).map(
      (line): TodoItem => ({ kind: 'BANK_LINE', id: `BANK_LINE:${line.bankTransactionId}`, line }),
    ),
    ...this.sourceItems(this.approvals, this.canSeeApprovals()).map(
      (checkup): TodoItem => ({ kind: 'APPROVAL', id: `APPROVAL:${checkup.reconciliationId}`, checkup }),
    ),
  ]);

  readonly counts = computed(() => {
    const items = this.todoItems();
    return {
      ALL: items.length,
      PAYMENTS: items.filter(item => item.kind === 'PAYMENT').length,
      BANK: items.filter(item => item.kind !== 'PAYMENT').length,
    } satisfies Record<TodoFilter, number>;
  });

  readonly visibleItems = computed(() => {
    const filter = this.filter();
    return this.todoItems().filter(item =>
      filter === 'ALL' ? true : filter === 'PAYMENTS' ? item.kind === 'PAYMENT' : item.kind !== 'PAYMENT',
    );
  });

  /**
   * The payment item whose match panel sent a write (CAP:550 S6). A re-read
   * that drops the now used-up payment must not tear its panel down while the
   * apply → credit → refund chain is in flight or its result is on screen, so
   * the item stays selected until the person picks another (the Customer
   * payments page's `resultFor`). A refused payments read drops it (ADR-0064 §6).
   */
  private readonly heldPayment = signal<TodoItem | null>(null);
  /**
   * A payment write (apply → credit → refund) is in flight in the detail panel.
   * Another item cannot be chosen until it settles: switching would destroy the
   * panel and cancel the request with its outcome and readback (ADR-0063 §4–5).
   */
  readonly paymentWriteInFlight = signal(false);
  /**
   * The lock that holds the other items: only while the write's own item is
   * still the selected panel. If that panel goes away (a refused payments read,
   * a lost permission) its request is cancelled with it and no settle ever
   * arrives, so the lock must not outlive the panel.
   */
  readonly paymentLock = computed(() => this.paymentWriteInFlight() && this.selectedItem()?.kind === 'PAYMENT');

  readonly selectedItem = computed(() => {
    const id = this.selectedId();
    const listed = this.todoItems().find(item => item.id === id);
    if (listed) return listed;
    const held = this.heldPayment();
    return held && held.id === id && this.canSeePayments() && !this.payments.denied() ? held : null;
  });

  /** True once every permitted to-do source has answered OK at least once with nothing to do. */
  readonly allCaughtUp = computed(
    () =>
      this.todoItems().length === 0 &&
      this.todoSources().length > 0 &&
      this.todoSources().every(region => region.status() === 'OK'),
  );

  /** The review handed to the panel: only the one answering the selected item (ADR-0063 §1). */
  readonly selectedReview = computed(() => {
    const item = this.selectedItem();
    if (item?.kind !== 'APPROVAL') return null;
    return this.review.dataKey() === item.checkup.reconciliationId ? this.review.data() : null;
  });
  readonly selectedReviewStatus = computed(() => {
    const item = this.selectedItem();
    if (item?.kind !== 'APPROVAL' || this.review.issuedKey() !== item.checkup.reconciliationId) return null;
    return this.review.status();
  });

  // ── Approve month ─────────────────────────────────────────────────────
  readonly approving = signal(false);
  /** The last approved check-up, for the page-level polite status (null account renders an em dash). */
  readonly approvedAccount = signal<{ account: string | null } | null>(null);
  readonly approveMessage = signal<{ key: string; params: Readonly<Record<string, unknown>> } | null>(null);
  /** The match panel's last outcome (CAP:550 S6), announced once in the to-do's status region. */
  readonly paymentMessage = signal<{ key: string; params: Readonly<Record<string, unknown>> } | null>(null);
  /** Focus owed after an approve re-read; drained by whichever approvals read lands last (ADR-0063 §4). */
  private focusOwed = false;

  readonly toDate = toDatePipeInput;

  /**
   * The `tid|sub` the held data belongs to. A plain field seeded from the
   * current token, so the effect's first run is not read as a change (the
   * `ChatBlobService` precedent).
   */
  private trackedIdentity = this.identity();
  /** The Approve month write in flight, if any; dropped on an identity change. */
  private approveSubscription: Subscription | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const region of [...Object.values(this.regions), this.review]) region.dispose();
      this.approveSubscription?.unsubscribe();
    });
    // ADR-0063 §7: a token for another tenant or person while the home stays
    // mounted invalidates every read in flight and clears what the previous
    // identity loaded, before anything is read for the new one. Preferences
    // follow on their own: their storage key is derived from the same claims.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      this.resetForIdentity();
      this.refresh();
    });
    // The payment lock never outlives its panel: whenever no payment panel is showing (a refused read,
    // a lost permission with no re-read), its write was cancelled with it and nothing will settle it.
    effect(() => {
      if (this.selectedItem()?.kind === 'PAYMENT') return;
      untracked(() => this.paymentWriteInFlight.set(false));
    });
    this.refresh();
  }

  /** `tid|sub`, each half percent-encoded so no value can contain the delimiter. The tenant is the `tid` claim, via AuthService. */
  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  /** Drops every read and write in flight (each region's sequence moves on) and clears all page state. */
  private resetForIdentity(): void {
    for (const region of [...Object.values(this.regions), this.review]) region.reset();
    this.approveSubscription?.unsubscribe();
    this.approveSubscription = null;
    this.approving.set(false);
    this.approveMessage.set(null);
    this.approvedAccount.set(null);
    this.paymentMessage.set(null);
    this.heldPayment.set(null);
    this.paymentWriteInFlight.set(false);
    this.focusOwed = false;
    this.selectedId.set(null);
    this.filter.set('ALL');
    this.helpOpen.set(false);
    this.state.set('idle');
    this.errorKey.set(null);
  }

  /** Re-reads every permitted region that has not been refused (ADR-0064 §6). */
  refresh(): void {
    this.approvedAccount.set(null);
    this.today.set(startOfLocalDay(this.clock()));
    const regions = this.permittedRegions();
    if (this.state() !== 'ready') {
      this.state.set('loading');
      this.errorKey.set(null);
    }
    for (const key of regions) {
      if (this.regions[key].denied()) continue;
      this.loadRegion(key);
    }
    this.settlePage();
  }

  retryRegion(key: RegionKey): void {
    this.today.set(startOfLocalDay(this.clock()));
    this.loadRegion(key);
  }

  private loadRegion(key: RegionKey): void {
    const asOfDate = toIsoDate(this.today());
    switch (key) {
      case 'period':
        this.period.load(this.periods.listPeriods());
        break;
      case 'receivables':
        this.receivables.load(this.home.receivables(asOfDate), asOfDate);
        break;
      case 'payables':
        this.payables.load(this.home.payables(asOfDate), asOfDate);
        break;
      case 'bank': {
        const periodCode = periodCodeOf(this.today());
        this.bank.load(this.home.bankCheckup(periodCode), periodCode);
        break;
      }
      case 'payments':
        this.payments.load(this.home.paymentsToMatch(TODO_PAGE_SIZE));
        break;
      case 'bankLines':
        this.bankLines.load(this.home.unexplainedBankLines(TODO_PAGE_SIZE));
        break;
      case 'approvals':
        this.approvals.load(this.home.checkupsAwaitingApproval(TODO_PAGE_SIZE));
        break;
    }
  }

  /**
   * `ready` once every permitted region has answered; `error` only when every one
   * failed for a reason other than authorization. A 403 is not a connection
   * problem: the refused region already names its permission, so a page whose
   * failures include a refusal never shows the connection message (ADR-0064 §4, §6).
   */
  private settlePage(): void {
    const regions = this.permittedRegions().map(key => this.regions[key]);
    if (regions.some(region => region.status() === 'PENDING')) return;
    const allFailed = regions.length > 0 && regions.every(region => region.status() === 'FAILED');
    if (allFailed && !regions.some(region => region.denied())) {
      this.state.set('error');
      this.errorKey.set('ACCOUNTING.HOME.ERROR.ALL_FAILED');
      return;
    }
    this.state.set('ready');
    this.errorKey.set(null);
  }

  private todoSources(): HomeRegion<unknown>[] {
    const sources: HomeRegion<unknown>[] = [];
    if (this.canSeePayments()) sources.push(this.payments);
    if (this.canSeeBankLines()) sources.push(this.bankLines);
    if (this.canSeeApprovals()) sources.push(this.approvals);
    return sources;
  }

  private sourceItems<T>(region: HomeRegion<TodoSourcePage<T>>, permitted: boolean): readonly T[] {
    if (!permitted || region.denied()) return [];
    return region.data()?.items ?? [];
  }

  /**
   * A to-do source answered. A refresh that removed the selected item clears
   * the panel and moves focus to the list heading; focus owed after Approve
   * month goes to the panel heading when the item is still there.
   */
  private onTodoSourceSettled(): void {
    this.settlePage();
    const selected = this.selectedId();
    const stillThere = !!selected && this.selectedItem() !== null;
    if (selected && !stillThere) {
      this.selectedId.set(null);
      // The panel, and any write it held, went with the item: nothing is held or locked any more.
      this.heldPayment.set(null);
      this.paymentWriteInFlight.set(false);
      this.review.reset();
      this.approveMessage.set(null);
      this.focusOwed = false;
      this.focusAfterRender(() => this.todoHeading()?.nativeElement.focus());
      return;
    }
    if (this.focusOwed && this.approvals.status() !== 'PENDING') {
      this.focusOwed = false;
      this.focusAfterRender(() => this.panel()?.focusHeading());
    }
  }

  // ── Header, Start here, Help guide ────────────────────────────────────
  toggleHelp(): void {
    this.helpOpen.update(open => !open);
  }

  openHelpGuide(): void {
    this.helpOpen.set(true);
    this.focusAfterRender(() => this.helpGuideHeading()?.nativeElement.focus());
  }

  dismissStartHere(): void {
    this.preferences.dismissStartHere();
    // The to-do heading exists only with a to-do source; the h1 always does (ADR-0029 §8.7).
    this.focusAfterRender(() => (this.todoHeading() ?? this.pageHeading())?.nativeElement.focus());
  }

  /** One truthful key per served status; an unset status claims neither open nor closed (ADR-0064 §4). */
  periodChipKey(period: AccountingPeriod): string {
    switch (period.status) {
      case 'OPEN':
        return 'ACCOUNTING.HOME.PERIOD_CHIP.OPEN';
      case 'CLOSED':
        return 'ACCOUNTING.HOME.PERIOD_CHIP.CLOSED';
      default:
        return 'ACCOUNTING.HOME.PERIOD_CHIP.UNKNOWN';
    }
  }

  // ── Lanes ─────────────────────────────────────────────────────────────
  /** Bar width as a percentage of a served total: display geometry, not money arithmetic. */
  share(part: number, total: number): number {
    if (!(total > 0) || !(part > 0)) return 0;
    return Math.min(100, (part / total) * 100);
  }

  checkupStatusKey(status: CheckupStatus): string {
    return CHECKUP_STATUS_KEYS[status];
  }

  // ── To-do list ────────────────────────────────────────────────────────
  setFilter(filter: TodoFilter): void {
    this.filter.set(filter);
  }

  select(item: TodoItem): void {
    if (this.paymentLock() && this.selectedId() !== item.id) return;
    this.approvedAccount.set(null);
    if (this.selectedId() !== item.id) {
      this.paymentMessage.set(null);
      this.heldPayment.set(null);
      // Only reachable with the lock off: a flag left by a panel that went away without settling
      // (e.g. a lost permission with no payments re-read) must not lock the new item.
      this.paymentWriteInFlight.set(false);
    }
    if (this.selectedId() !== item.id) {
      this.approveMessage.set(null);
      this.focusOwed = false;
    }
    this.selectedId.set(item.id);
    if (item.kind === 'APPROVAL') {
      this.review.load(this.workspace.getReview(item.checkup.reconciliationId), item.checkup.reconciliationId);
    } else {
      this.review.reset();
    }
    if (this.isSmallScreen()) {
      this.focusAfterRender(() => this.panel()?.focusHeading());
    }
  }

  /** The match panel sent an apply: hold its payment item selected through the write chain and its result. */
  onPaymentWriteStarted(): void {
    const item = this.selectedItem();
    if (item?.kind === 'PAYMENT') this.heldPayment.set(item);
    this.paymentWriteInFlight.set(true);
  }

  /** Nothing of the panel's write chain is in flight: other items can be chosen again. */
  onPaymentWriteSettled(): void {
    this.paymentWriteInFlight.set(false);
  }

  /** The apply was refused (4xx): nothing was written, so the item is released and follows the list again. */
  onPaymentWriteReleased(): void {
    this.heldPayment.set(null);
    this.paymentWriteInFlight.set(false);
    // A payments read that settled during the apply may already have dropped the item: settle the
    // selection now, clearing it and moving focus to the to-do heading (ADR-0063 §1, ADR-0029 §8.7).
    this.onTodoSourceSettled();
  }

  /**
   * The match panel applied a payment (CAP:550 S6): the payments and the Money
   * owed lane re-read under their own guards. A payment that is now fully
   * applied leaves the to-do list, but its item stays selected (`heldPayment`)
   * so the panel keeps its result, and any credit or refund still running,
   * until the person picks another item; the outcome stays announced.
   */
  onPaymentApplied(): void {
    this.today.set(startOfLocalDay(this.clock()));
    if (this.canSeePayments() && !this.payments.denied()) this.loadRegion('payments');
    if (this.canSeeReceivables() && !this.receivables.denied()) this.loadRegion('receivables');
  }

  /** The payment changed under the person, or its remainder moved: the payments re-read. */
  onPaymentChanged(): void {
    if (this.canSeePayments() && !this.payments.denied()) this.loadRegion('payments');
  }

  onPaymentAnnounce(message: { key: string; params: Readonly<Record<string, unknown>> }): void {
    this.approvedAccount.set(null);
    this.paymentMessage.set({ key: message.key, params: message.params });
  }

  /** Approve month (§5.1, §9.1): permission, the served `canApprove` and no write in flight, re-checked here. */
  approveMonth(): void {
    const item = this.selectedItem();
    if (!this.canApproveReconciliation() || item?.kind !== 'APPROVAL' || this.approving()) return;
    const reconciliationId = item.checkup.reconciliationId;
    const accountName = item.checkup.accountName;
    // The outcome belongs to the item it was sent for, captured now (ADR-0063 §1).
    const itemId = item.id;
    const stillSelected = (): boolean => this.selectedItem()?.id === itemId;
    const review = this.selectedReview();
    if (this.selectedReviewStatus() !== 'OK' || !review?.readiness.canApprove) return;

    this.approving.set(true);
    this.approveMessage.set(null);
    this.approvedAccount.set(null);
    this.approveSubscription?.unsubscribe();
    this.approveSubscription = this.workspace
      .approve(reconciliationId, review.header.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.approving.set(false);
          // Announced outside the panel: the approved item, and its panel, leave the list.
          this.approvedAccount.set({ account: accountName });
          if (stillSelected()) this.focusOwed = true;
          this.loadRegion('approvals');
          if (this.canSeeBank() && !this.bank.denied()) this.loadRegion('bank');
        },
        error: (error: unknown) => {
          this.approving.set(false);
          const failure = toBankRecFailure(error);
          const stale = (failure.code && APPROVE_STALE_CODES.has(failure.code)) || failure.status === 409;
          if (!stillSelected()) {
            // The person moved to another item: its panel must not show this outcome or take focus.
            if (stale) this.loadRegion('approvals');
            return;
          }
          if (failure.status === 403) {
            this.approveMessage.set({
              key: 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.FORBIDDEN',
              params: { permission: ACCOUNTING_SECTION.reconciliationApprove[0] },
            });
            return;
          }
          this.approveMessage.set({
            key: (failure.code && APPROVE_ERROR_KEYS[failure.code]) || 'ACCOUNTING.HOME.TODO.APPROVAL.ERROR.OTHER',
            // No counts: the review on screen predates the refusal, so its counts would be stale.
            params: {},
          });
          if (stale) {
            this.focusOwed = true;
            this.review.load(this.workspace.getReview(reconciliationId), reconciliationId);
            this.loadRegion('approvals');
          }
        },
      });
  }

  /** Phone and small-tablet widths, where the panel stacks below the list (§5.7). */
  isSmallScreen(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(SMALL_SCREEN_QUERY).matches
      : false;
  }

  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }
}
