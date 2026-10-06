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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription, map } from 'rxjs';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { HelpDisclosureComponent } from '../../components/help-disclosure/help-disclosure.component';
import { LedgerTableComponent } from '../../components/ledger-table/ledger-table.component';
import { HomePageState } from '../../models/accounting-home.models';
import {
  AccountLedger,
  AgedCustomerRow,
  AgedReport,
  AgedVendorRow,
  AgingBuckets,
  BOOKS_TABS,
  BalanceSheetSummary,
  BooksTab,
  DrilldownAccount,
  EXPORT_FORMATS,
  EXPORT_REPORT_TYPES,
  ExportFormat,
  ExportJob,
  ExportReportType,
  GlAccountOption,
  IncomeSummary,
  JournalEntry,
  JournalEntryPage,
  StatementLine,
  isBooksTab,
} from '../../models/books.models';
import { AccountingPeriod, periodCodeOf, periodHasStarted, periodMonthStart } from '../../models/period-close.models';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { BooksService } from '../../services/books.service';
import { PeriodCloseService } from '../../services/period-close.service';
import {
  OTHER_LINE_KEY,
  STATEMENT_LINES,
  SummarySection,
  WhatHappened,
  describeEntry,
  entryStatusKey,
  entryStatusTone,
  isKey,
} from '../../utils/books-display';
import { toDatePipeInput } from '../../utils/date-only.util';
import { toIsoDate } from '../../utils/date-window.util';
import { HomeRegion } from '../../utils/home-region';

/** The page's clock. Tests inject a fixed instant; "today" is re-read from it on every load (ADR-0038). */
export const BOOKS_CLOCK = new InjectionToken<() => Date>('BOOKS_CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

/** Export polling: the first wait and the cap of a growing interval (story PROPOSED 9). */
export const EXPORT_POLL_FIRST_MS = 1000;
export const EXPORT_POLL_MAX_MS = 8000;
/** Status reads before giving up (1 + 2 + 4 + 8 × 14 s ≈ 2 minutes); the export then reads as failed. */
export const EXPORT_POLL_MAX_ATTEMPTS = 17;

/** One option of the period select. `status` is null when no period read backs it (story PROPOSED 2). */
export interface PeriodOption {
  readonly periodCode: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly status: 'OPEN' | 'CLOSED' | null;
}

/** The selected period's dates: "so far" runs from `startDate` to `asAt`. */
export interface BooksRange {
  readonly periodCode: string;
  readonly startDate: string;
  readonly asAt: string;
  /** The period contains today, so amounts are as at today. */
  readonly isCurrent: boolean;
  readonly status: 'OPEN' | 'CLOSED' | null;
}

/** A Summary line as rendered: its label key (or "Other") and the served amount. */
export interface SummaryRow extends StatementLine {
  readonly labelKey: string;
  readonly listed: boolean;
}

export interface DrillTarget {
  readonly code: string;
  readonly labelKey: string;
}

type ExportPhase = 'choosing' | 'requesting' | 'waiting' | 'done' | 'failed';

/** Tab label keys and their accountant's terms (P1); literal so the i18n check sees every key. */
export const TAB_KEYS: Readonly<Record<BooksTab, { readonly label: string; readonly term: string }>> = {
  summary: { label: 'ACCOUNTING.BOOKS.TABS.SUMMARY', term: 'ACCOUNTING.BOOKS.TABS.SUMMARY_TERM' },
  owed: { label: 'ACCOUNTING.BOOKS.TABS.OWED', term: 'ACCOUNTING.BOOKS.TABS.OWED_TERM' },
  entries: { label: 'ACCOUNTING.BOOKS.TABS.ENTRIES', term: 'ACCOUNTING.BOOKS.TABS.ENTRIES_TERM' },
};

/** Export choices, literal for the i18n check. */
export const EXPORT_REPORT_KEYS: Readonly<Record<ExportReportType, string>> = {
  BALANCE_SHEET: 'ACCOUNTING.BOOKS.EXPORT.REPORT.BALANCE_SHEET',
  INCOME_STATEMENT: 'ACCOUNTING.BOOKS.EXPORT.REPORT.INCOME_STATEMENT',
  AGED_RECEIVABLES: 'ACCOUNTING.BOOKS.EXPORT.REPORT.AGED_RECEIVABLES',
  AGED_PAYABLES: 'ACCOUNTING.BOOKS.EXPORT.REPORT.AGED_PAYABLES',
  GENERAL_LEDGER: 'ACCOUNTING.BOOKS.EXPORT.REPORT.GENERAL_LEDGER',
  TRIAL_BALANCE: 'ACCOUNTING.BOOKS.EXPORT.REPORT.TRIAL_BALANCE',
};

export const EXPORT_FORMAT_KEYS: Readonly<Record<ExportFormat, string>> = {
  PDF: 'ACCOUNTING.BOOKS.EXPORT.FORMAT.PDF',
  CSV: 'ACCOUNTING.BOOKS.EXPORT.FORMAT.CSV',
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Descending by the served total; a missing total sorts last. */
function byServedTotal(a: AgingBuckets, b: AgingBuckets): number {
  if (a.totalOutstanding === null) return b.totalOutstanding === null ? 0 : 1;
  if (b.totalOutstanding === null) return -1;
  return b.totalOutstanding - a.totalOutstanding;
}

function monthBounds(periodCode: string): { startDate: string; endDate: string } {
  const start = periodMonthStart(periodCode);
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(new Date(start.getFullYear(), start.getMonth() + 1, 0)),
  };
}

/**
 * Your books (CAP:550 S5; SPEC-accounting-workspace §5.4, §8.1 row `books`):
 * the period select, Export for your accountant, the tabs Summary · Who owes
 * what · All entries, the "How to read your books" disclosure, and the account
 * drill-down.
 *
 * Every read is a {@link HomeRegion} with its own `PENDING | OK | FAILED`
 * status and sequence, keyed by what it answers (period dates, entry search,
 * account); only data whose key matches the current selection paints, so a
 * late response for an old period, page or account never renders (ADR-0063).
 * A failed tab never blanks another (ADR-0064). Each tab and action is offered
 * and read only with the code its call enforces (`ACCOUNTING_SECTION.books*`,
 * `reportExport`, `chartOfAccounts`).
 *
 * Amounts, totals, buckets and balances render as served through `MoneyPipe`;
 * the page adds nothing (P7). Entries show `JE-YYYYMM-n`, accounts and
 * customers their names; ids are route keys only (P8).
 */
@Component({
  selector: 'app-books-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MoneyPipe,
    RouterLink,
    TranslatePipe,
    ModalDialogDirective,
    HelpDisclosureComponent,
    LedgerTableComponent,
  ],
  templateUrl: './books-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './books-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BooksPageComponent {
  private readonly auth = inject(AuthService);
  private readonly books = inject(BooksService);
  private readonly periods = inject(PeriodCloseService);
  private readonly preferences = inject(AccountingPreferencesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clock = inject(BOOKS_CLOCK);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  private readonly drillHeading = viewChild<ElementRef<HTMLElement>>('drillHeading');
  private readonly ledgerHeading = viewChild<ElementRef<HTMLElement>>('ledgerHeading');
  private readonly summaryHeading = viewChild<ElementRef<HTMLElement>>('summaryHeading');
  private readonly owedHeading = viewChild<ElementRef<HTMLElement>>('owedHeading');
  private readonly entriesHeading = viewChild<ElementRef<HTMLElement>>('entriesHeading');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  // ── Page state (ADR-0031) ──────────────────────────────────────────────
  readonly state = signal<HomePageState>('idle');
  readonly errorKey = signal<string | null>(null);
  /** Local today, re-read on every load (ADR-0038). */
  readonly today = signal(startOfLocalDay(this.clock()));
  readonly showTerms = this.preferences.showTerms;

  // ── Gates (the unknown-perm_bits case follows canAccess) ────────────────
  readonly canSeeSummary = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.booksSummary }));
  readonly canSeeEntries = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.booksEntries }));
  readonly canFilterAccounts = computed(() =>
    canAccess(this.auth, { allPermissions: ACCOUNTING_SECTION.chartOfAccounts }),
  );
  readonly canExport = computed(() => canAccess(this.auth, { allPermissions: ACCOUNTING_SECTION.reportExport }));
  readonly canSeePeriods = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.homePeriodChip }));
  readonly canOpenEntry = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_PAGE.journalEntry }));
  /** The codes a refused read names (ADR-0064 §6). */
  readonly codes = {
    reporting: ACCOUNTING_SECTION.booksSummary[0],
    entries: ACCOUNTING_SECTION.booksEntries[0],
    chart: ACCOUNTING_SECTION.chartOfAccounts[0],
  } as const;

  readonly availableTabs = computed<BooksTab[]>(() =>
    BOOKS_TABS.filter(tab => (tab === 'entries' ? this.canSeeEntries() : this.canSeeSummary())),
  );
  /** No tab this session can read: `accounting:coa:view` alone (story Spec discrepancy 6). */
  readonly emptyAccess = computed(() => this.availableTabs().length === 0);

  private readonly queryTab = toSignal(this.route.queryParamMap.pipe(map(params => params.get('tab'))), {
    initialValue: this.route.snapshot?.queryParamMap?.get('tab') ?? null,
  });
  private readonly chosenTab = signal<BooksTab | null>(null);
  readonly activeTab = computed<BooksTab | null>(() => {
    const available = this.availableTabs();
    const requested = this.chosenTab() ?? this.queryTab();
    if (isBooksTab(requested) && available.includes(requested)) return requested;
    return available[0] ?? null;
  });
  readonly tabKeys = TAB_KEYS;

  // ── Regions ────────────────────────────────────────────────────────────
  readonly periodList = new HomeRegion<AccountingPeriod[]>();
  readonly balance = new HomeRegion<BalanceSheetSummary>(() => this.settlePage());
  readonly income = new HomeRegion<IncomeSummary>(() => this.settlePage());
  readonly receivables = new HomeRegion<AgedReport<AgedCustomerRow>>(() => this.settlePage());
  readonly payables = new HomeRegion<AgedReport<AgedVendorRow>>(() => this.settlePage());
  readonly entries = new HomeRegion<JournalEntryPage>(() => this.settlePage());
  readonly glAccounts = new HomeRegion<GlAccountOption[]>();
  readonly accountLedger = new HomeRegion<AccountLedger>();
  readonly drillAccounts = new HomeRegion<DrilldownAccount[]>(ok => this.onDrillAccounts(ok));
  readonly drillLedger = new HomeRegion<AccountLedger>();

  private readonly allRegions: readonly HomeRegion<unknown>[] = [
    this.periodList,
    this.balance,
    this.income,
    this.receivables,
    this.payables,
    this.entries,
    this.glAccounts,
    this.accountLedger,
    this.drillAccounts,
    this.drillLedger,
  ];

  // ── Period select ─────────────────────────────────────────────────────
  readonly selectedPeriodCode = signal(periodCodeOf(this.today()));

  /**
   * Served months that have started, plus the current month when no row backs
   * it. Without `accounting:period:view`, or on a failed read, only the
   * current calendar month, unlabelled (story PROPOSED 2).
   */
  readonly periodOptions = computed<PeriodOption[]>(() => {
    const today = this.today();
    const currentCode = periodCodeOf(today);
    const current: PeriodOption = { periodCode: currentCode, ...monthBounds(currentCode), status: null };
    if (!this.canSeePeriods() || this.periodList.status() !== 'OK') return [current];
    const served = (this.periodList.data() ?? [])
      .filter(period => periodHasStarted(period.periodCode, today) && !!period.startDate && !!period.endDate)
      .map(
        (period): PeriodOption => ({
          periodCode: period.periodCode,
          startDate: period.startDate!,
          endDate: period.endDate!,
          status: period.status === 'UNKNOWN' ? null : period.status,
        }),
      );
    return served.some(option => option.periodCode === currentCode) ? served : [current, ...served];
  });

  readonly range = computed<BooksRange>(() => {
    const code = this.selectedPeriodCode();
    const option = this.periodOptions().find(candidate => candidate.periodCode === code) ?? {
      periodCode: code,
      ...monthBounds(code),
      status: null,
    };
    const todayIso = toIsoDate(this.today());
    const isCurrent = option.startDate <= todayIso && todayIso <= option.endDate;
    return {
      periodCode: option.periodCode,
      startDate: option.startDate,
      asAt: isCurrent ? todayIso : option.endDate,
      isCurrent,
      status: option.status,
    };
  });

  private readonly asAtKey = computed(() => this.range().asAt);
  private readonly rangeKey = computed(() => `${this.range().startDate}|${this.range().asAt}`);

  // ── Summary ───────────────────────────────────────────────────────────
  /** The balance sheet answering the selected as-at date, never an older one (ADR-0063 §1). */
  readonly balanceData = computed(() =>
    this.balance.dataKey() === this.asAtKey() && !this.balance.denied() ? this.balance.data() : null,
  );
  readonly incomeData = computed(() =>
    this.income.dataKey() === this.rangeKey() && !this.income.denied() ? this.income.data() : null,
  );

  readonly balanceRows = computed(() => this.rowsBySection(this.balanceData()?.lines ?? []));
  readonly incomeRows = computed<SummaryRow[]>(() => (this.incomeData()?.lines ?? []).map(line => this.toRow(line)));

  // ── Drill-down ────────────────────────────────────────────────────────
  readonly drillTarget = signal<DrillTarget | null>(null);
  readonly drillAccountId = signal<string | null>(null);
  readonly drillAccountsData = computed(() => {
    const target = this.drillTarget();
    return target && this.drillAccounts.dataKey() === `${target.code}|${this.rangeKey()}`
      ? this.drillAccounts.data()
      : null;
  });
  readonly drillLedgerData = computed(() => {
    const accountId = this.drillAccountId();
    const held = this.drillLedger.data();
    return accountId && this.drillLedger.dataKey() === `${accountId}|${this.rangeKey()}` ? held?.section ?? null : null;
  });
  readonly drillLedgerEmpty = computed(() => {
    const accountId = this.drillAccountId();
    return (
      !!accountId &&
      this.drillLedger.dataKey() === `${accountId}|${this.rangeKey()}` &&
      this.drillLedger.status() === 'OK' &&
      !this.drillLedger.data()?.section
    );
  });

  // ── Who owes what ─────────────────────────────────────────────────────
  readonly receivablesData = computed(() =>
    this.receivables.dataKey() === this.asAtKey() && !this.receivables.denied() ? this.receivables.data() : null,
  );
  readonly payablesData = computed(() =>
    this.payables.dataKey() === this.asAtKey() && !this.payables.denied() ? this.payables.data() : null,
  );
  /** Largest served total first, rows without a served total last; sorting is not arithmetic (P7). */
  readonly customerRows = computed(() => [...(this.receivablesData()?.rows ?? [])].sort(byServedTotal));
  readonly vendorRows = computed(() => [...(this.payablesData()?.rows ?? [])].sort(byServedTotal));

  // ── All entries ───────────────────────────────────────────────────────
  readonly searchText = signal('');
  readonly entryNumber = signal<string | null>(null);
  readonly entryPage = signal(0);
  readonly filterAccountId = signal<string | null>(null);
  private readonly entriesKey = computed(() => `${this.entryNumber() ?? ''}|${this.entryPage()}`);
  readonly entriesData = computed(() =>
    this.entries.dataKey() === this.entriesKey() && !this.entries.denied() ? this.entries.data() : null,
  );
  readonly accountLedgerData = computed(() => {
    const accountId = this.filterAccountId();
    return accountId && this.accountLedger.dataKey() === `${accountId}|${this.rangeKey()}`
      ? this.accountLedger.data()
      : null;
  });

  // ── Export ────────────────────────────────────────────────────────────
  readonly exportOpen = signal(false);
  readonly exportReport = signal<ExportReportType>('BALANCE_SHEET');
  readonly exportFormat = signal<ExportFormat>('PDF');
  readonly exportPhase = signal<ExportPhase>('choosing');
  readonly exportReports = EXPORT_REPORT_TYPES;
  readonly exportFormats = EXPORT_FORMATS;
  readonly exportReportKeys = EXPORT_REPORT_KEYS;
  readonly exportFormatKeys = EXPORT_FORMAT_KEYS;
  /** Bumped on every request, close and destroy: a poll or response from an older job never acts (ADR-0063 §6). */
  private exportToken = 0;
  private exportSubscription: Subscription | null = null;
  private exportTimer: ReturnType<typeof setTimeout> | null = null;

  /** The page's polite announcement (§5.7, ADR-0029 §8.8): a live region outside every `@if`. */
  readonly announcement = signal<{ key: string; params: Readonly<Record<string, unknown>> } | null>(null);

  readonly toDate = toDatePipeInput;
  readonly isKey = isKey;
  readonly statusKey = entryStatusKey;
  readonly statusTone = entryStatusTone;

  /** `tid|sub` the held data belongs to; seeded so the effect's first run is not a change (S4 precedent). */
  private trackedIdentity = this.identity();
  /** Bumped on an identity change so the loading effects re-run for the new identity. */
  private readonly identityTick = signal(0);

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const region of this.allRegions) region.dispose();
      this.stopExport();
    });
    // ADR-0063 §7: another tenant or person invalidates every read in flight and clears the page.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => this.resetForIdentity());
    });
    // A tab named in the URL (a link, Back) wins over the last button pressed.
    effect(() => {
      this.queryTab();
      untracked(() => this.chosenTab.set(null));
    });
    // The period list is read once per identity, with its own permission.
    effect(() => {
      this.identityTick();
      if (!this.canSeePeriods()) return;
      untracked(() => this.periodList.load(this.periods.listPeriods()));
    });
    // The active tab's reads follow the tab and the selected dates.
    effect(() => {
      const tab = this.activeTab();
      this.rangeKey();
      this.entriesKey();
      this.filterAccountId();
      this.identityTick();
      untracked(() => this.loadTab(tab));
    });
  }

  /** `tid|sub`, each half percent-encoded so no value can contain the delimiter. */
  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  private resetForIdentity(): void {
    for (const region of this.allRegions) region.reset();
    this.closeExport();
    this.drillTarget.set(null);
    this.drillAccountId.set(null);
    this.filterAccountId.set(null);
    this.entryNumber.set(null);
    this.searchText.set('');
    this.entryPage.set(0);
    this.selectedPeriodCode.set(periodCodeOf(this.clock()));
    this.announcement.set(null);
    this.state.set('idle');
    this.errorKey.set(null);
    this.identityTick.update(tick => tick + 1);
  }

  // ── Loading ───────────────────────────────────────────────────────────
  /** Reads what the tab shows that is not already held, or being read, for the current selection. */
  private loadTab(tab: BooksTab | null): void {
    this.today.set(startOfLocalDay(this.clock()));
    if (!tab) {
      this.state.set('ready');
      this.errorKey.set(null);
      return;
    }
    const { startDate, asAt } = this.range();
    const rangeKey = this.rangeKey();
    switch (tab) {
      case 'summary':
        this.ensure(this.balance, asAt, () => this.books.balanceSheet(asAt));
        this.ensure(this.income, rangeKey, () => this.books.incomeStatement(startDate, asAt));
        break;
      case 'owed':
        this.ensure(this.receivables, asAt, () => this.books.agedReceivables(asAt));
        this.ensure(this.payables, asAt, () => this.books.agedPayables(asAt));
        break;
      case 'entries': {
        const accountId = this.filterAccountId();
        if (this.canFilterAccounts()) this.ensure(this.glAccounts, 'all', () => this.books.listGlAccounts());
        if (accountId && this.canFilterAccounts()) {
          this.ensure(this.accountLedger, `${accountId}|${rangeKey}`, () =>
            this.books.accountLedger(startDate, asAt, accountId),
          );
        } else {
          const entryNumber = this.entryNumber();
          const page = this.entryPage();
          this.ensure(this.entries, this.entriesKey(), () =>
            this.books.listJournalEntries(page, entryNumber ?? undefined),
          );
        }
        break;
      }
    }
    this.settlePage();
  }

  /** Issues a read unless the region already holds, or is reading, an answer for `key`; a refused read is not repeated. */
  private ensure<T>(region: HomeRegion<T>, key: string, read: () => Observable<T>): void {
    if (region.issuedKey() === key && (region.status() !== 'FAILED' || region.denied())) return;
    region.load(read(), key);
  }

  /** The regions the active tab shows. */
  private activeRegions(): HomeRegion<unknown>[] {
    switch (this.activeTab()) {
      case 'summary':
        return [this.balance, this.income];
      case 'owed':
        return [this.receivables, this.payables];
      case 'entries':
        return this.filterAccountId() ? [this.accountLedger] : [this.entries];
      default:
        return [];
    }
  }

  /**
   * `ready` once the active tab's reads answer; `error` only when all of them
   * failed for a reason other than authorization — a refused read names its
   * permission instead (ADR-0064 §4, §6).
   */
  private settlePage(): void {
    const regions = this.activeRegions();
    if (regions.some(region => region.status() === 'PENDING')) {
      if (this.state() !== 'ready') {
        this.state.set('loading');
        this.errorKey.set(null);
      }
      return;
    }
    if (regions.length > 0 && regions.every(region => region.status() === 'FAILED' && !region.denied())) {
      this.state.set('error');
      this.errorKey.set('ACCOUNTING.BOOKS.ERROR.LOAD');
      return;
    }
    this.state.set('ready');
    this.errorKey.set(null);
  }

  /** Retry: re-reads every read of the active tab that failed. */
  retry(): void {
    for (const region of this.activeRegions()) {
      if (region.status() === 'FAILED' && !region.denied()) region.issuedKey.set(null);
    }
    this.loadTab(this.activeTab());
    this.focusPanelHeading();
  }

  retryRegion(region: 'balance' | 'income' | 'receivables' | 'payables' | 'entries' | 'accountLedger' | 'glAccounts'): void {
    this[region].issuedKey.set(null);
    this.loadTab(this.activeTab());
    this.focusPanelHeading();
  }

  /** The control that was pressed is replaced while the read runs: focus the panel's heading, never `<body>` (ADR-0029 §8.7). */
  private focusPanelHeading(): void {
    const heading =
      this.activeTab() === 'summary'
        ? this.summaryHeading
        : this.activeTab() === 'owed'
          ? this.owedHeading
          : this.entriesHeading;
    this.focusAfterRender(() => heading()?.nativeElement.focus());
  }

  // ── Header ────────────────────────────────────────────────────────────
  selectPeriod(periodCode: string): void {
    if (periodCode === this.selectedPeriodCode()) return;
    this.closeDrill();
    this.selectedPeriodCode.set(periodCode);
  }

  /** One truthful label per served status; an unbacked month is unlabelled (story PROPOSED 2, ADR-0064 §4). */
  periodOptionKey(option: PeriodOption): string {
    switch (option.status) {
      case 'OPEN':
        return 'ACCOUNTING.BOOKS.PERIOD.OPEN';
      case 'CLOSED':
        return 'ACCOUNTING.BOOKS.PERIOD.CLOSED';
      default:
        return 'ACCOUNTING.BOOKS.PERIOD.PLAIN';
    }
  }

  monthOf(periodCode: string): Date {
    return periodMonthStart(periodCode);
  }

  selectTab(tab: BooksTab): void {
    if (!this.availableTabs().includes(tab)) return;
    this.chosenTab.set(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────
  private toRow(line: StatementLine): SummaryRow {
    const listed = STATEMENT_LINES[line.code];
    return { ...line, labelKey: listed?.key ?? OTHER_LINE_KEY, listed: !!listed };
  }

  /** Served lines grouped by section in served order; a line nobody documented goes to Other, never dropped. */
  private rowsBySection(lines: readonly StatementLine[]): Record<SummarySection | 'OTHER', SummaryRow[]> {
    const grouped: Record<SummarySection | 'OTHER', SummaryRow[]> = { OWN: [], OWE: [], YOURS: [], INCOME: [], OTHER: [] };
    for (const line of lines) {
      const listed = STATEMENT_LINES[line.code];
      const section = listed && listed.section !== 'INCOME' ? listed.section : 'OTHER';
      grouped[section].push(this.toRow(line));
    }
    return grouped;
  }

  /** Opens a line's accounts (`drilldownToAccounts`); a single account opens its entries directly. */
  openLine(row: SummaryRow): void {
    if (!this.canSeeSummary()) return;
    const { startDate, asAt } = this.range();
    this.drillTarget.set({ code: row.code, labelKey: row.labelKey });
    this.drillAccountId.set(null);
    this.drillLedger.reset();
    this.drillAccounts.load(this.books.drilldown(row.code, startDate, asAt), `${row.code}|${this.rangeKey()}`);
    this.focusAfterRender(() => this.drillHeading()?.nativeElement.focus());
  }

  private onDrillAccounts(ok: boolean): void {
    const accounts = this.drillAccountsData();
    if (ok && accounts?.length === 1) this.openAccount(accounts[0], false);
  }

  openAccount(account: DrilldownAccount, moveFocus = true): void {
    if (!this.canSeeSummary()) return;
    const { startDate, asAt } = this.range();
    this.drillAccountId.set(account.accountId);
    this.drillLedger.load(
      this.books.accountLedger(startDate, asAt, account.accountId),
      `${account.accountId}|${this.rangeKey()}`,
    );
    if (moveFocus) this.focusAfterRender(() => this.ledgerHeading()?.nativeElement.focus());
  }

  closeDrill(): void {
    const wasOpen = !!this.drillTarget();
    this.drillTarget.set(null);
    this.drillAccountId.set(null);
    this.drillAccounts.reset();
    this.drillLedger.reset();
    if (wasOpen) this.focusAfterRender(() => this.summaryHeading()?.nativeElement.focus());
  }

  drillAccountName(): string | null {
    const accountId = this.drillAccountId();
    return this.drillAccountsData()?.find(account => account.accountId === accountId)?.accountName ?? null;
  }

  // ── All entries ───────────────────────────────────────────────────────
  /** Searches one exact entry number (the only search the list supports, story Spec discrepancy 5). */
  search(): void {
    const value = this.searchText().trim();
    this.filterAccountId.set(null);
    this.entryPage.set(0);
    this.entryNumber.set(value || null);
  }

  /** Clear removes its own button: focus returns to the search box (ADR-0029 §8.7). */
  clearSearch(): void {
    this.searchText.set('');
    this.entryPage.set(0);
    this.entryNumber.set(null);
    this.focusAfterRender(() => this.searchInput()?.nativeElement.focus());
  }

  /** The table, and its paging, is replaced while the page loads: focus moves to the list heading. */
  goToPage(page: number): void {
    const total = this.entriesData()?.totalPages ?? 1;
    if (page < 0 || page >= total) return;
    this.entryPage.set(page);
    this.focusAfterRender(() => this.entriesHeading()?.nativeElement.focus());
  }

  selectFilterAccount(accountId: string): void {
    if (!this.canFilterAccounts()) return;
    this.filterAccountId.set(accountId || null);
  }

  whatHappened(entry: JournalEntry): WhatHappened {
    return describeEntry(entry);
  }

  // ── Export for your accountant ────────────────────────────────────────
  openExport(): void {
    if (!this.canExport()) return;
    this.stopExport();
    this.exportPhase.set('choosing');
    this.exportOpen.set(true);
  }

  closeExport(): void {
    this.stopExport();
    this.exportOpen.set(false);
    this.exportPhase.set('choosing');
  }

  /** Requests the export, then polls with a growing interval until it completes (download once) or fails. */
  startExport(): void {
    if (!this.canExport() || this.exportPhase() === 'requesting' || this.exportPhase() === 'waiting') return;
    this.stopExport();
    const token = ++this.exportToken;
    const reportType = this.exportReport();
    const format = this.exportFormat();
    const { startDate, asAt } = this.range();
    const filename = `books-${reportType.toLowerCase().replace(/_/g, '-')}-${startDate}-${asAt}.${format.toLowerCase()}`;
    this.exportPhase.set('requesting');
    this.announcement.set(null);
    this.exportSubscription = this.books
      .requestExport(reportType, format, startDate, asAt)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: job => this.onExportJob(token, job, filename, EXPORT_POLL_FIRST_MS, 0),
        error: () => this.failExport(token),
      });
  }

  /** `attempts` counts the status reads made so far; an export still not settled after the cap reads as failed. */
  private onExportJob(token: number, job: ExportJob, filename: string, wait: number, attempts: number): void {
    if (token !== this.exportToken) return;
    if (job.status === 'COMPLETED') {
      this.download(token, job.exportId, filename);
      return;
    }
    if (job.status === 'FAILED' || !job.exportId || attempts >= EXPORT_POLL_MAX_ATTEMPTS) {
      this.failExport(token);
      return;
    }
    this.exportPhase.set('waiting');
    this.exportTimer = setTimeout(() => {
      this.exportTimer = null;
      if (token !== this.exportToken) return;
      this.exportSubscription = this.books
        .exportStatus(job.exportId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: next =>
            this.onExportJob(token, next, filename, Math.min(wait * 2, EXPORT_POLL_MAX_MS), attempts + 1),
          error: () => this.failExport(token),
        });
    }, wait);
  }

  private download(token: number, exportId: string, filename: string): void {
    this.exportSubscription = this.books
      .downloadExport(exportId, filename)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (token !== this.exportToken) return;
          this.exportPhase.set('done');
          this.announcement.set({ key: 'ACCOUNTING.BOOKS.EXPORT.DONE', params: {} });
        },
        error: () => this.failExport(token),
      });
  }

  private failExport(token: number): void {
    if (token !== this.exportToken) return;
    this.exportPhase.set('failed');
  }

  private stopExport(): void {
    this.exportToken++;
    this.exportSubscription?.unsubscribe();
    this.exportSubscription = null;
    if (this.exportTimer !== null) clearTimeout(this.exportTimer);
    this.exportTimer = null;
  }

  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }
}
