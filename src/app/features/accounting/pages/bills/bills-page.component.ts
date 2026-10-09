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
  forwardRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { HelpDisclosureComponent } from '../../components/help-disclosure/help-disclosure.component';
import { HomePageState } from '../../models/accounting-home.models';
import { BILL_STAGES, BillSelection, BillStage, BillStageCounts, BillStagePage, BillStageRow } from '../../models/payables.models';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { PayablesService } from '../../services/payables.service';
import { CHANNEL_ICONS, CHANNEL_KEYS, Copy, STAGE_KEYS, copy, statusLabelKey, statusTermKey, statusTone } from '../../utils/bill-display';
import { HomeRegion } from '../../utils/home-region';
import { BillsPageLink } from './bills-page-link';

/** Phone and small-tablet widths, where the review panel stacks below the list (§5.7). */
export const BILLS_SMALL_SCREEN_QUERY = '(width <= 767px)';

/**
 * Bills to pay (CAP:550 S14; SPEC-accounting-workspace §5.2, §8.1 rows `bills`,
 * `bills/:billId`): the header, **How a bill moves** with the served counts,
 * one step's bills and — as the child route — the review panel.
 *
 * - The counts and the list are separate reads, each with its own status,
 *   sequence and Retry (ADR-0063, ADR-0064); counts are read-only figures,
 *   never summed (P7).
 * - The default step is Check, or Approve when Check is empty and the session
 *   can approve (story item 3).
 * - The review panel is the child route, so picking a row changes only the
 *   panel and the URL; a reload or shared link opens the same bill (AC 5).
 * - Gates: the page `accounting:ap:view`; Approval limits
 *   `accounting:ap_approval_policy:manage`; Review and pay `accounting:ap:pay`.
 *   Unknown `perm_bits` follow `canAccess` (ADR-0040 §6a).
 */
@Component({
  selector: 'app-bills-page',
  standalone: true,
  imports: [DatePipe, MoneyPipe, MaterialSymbolPipe, RouterLink, RouterOutlet, TranslatePipe, HelpDisclosureComponent],
  templateUrl: './bills-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', '../../components/bills/bills-shared.css', './bills-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: BillsPageLink, useExisting: forwardRef(() => BillsPageComponent) }],
})
export class BillsPageComponent implements BillsPageLink {
  private readonly auth = inject(AuthService);
  private readonly payables = inject(PayablesService);
  private readonly preferences = inject(AccountingPreferencesService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly listHeading = viewChild<ElementRef<HTMLElement>>('listHeading');

  // ── Page state (ADR-0031) ──────────────────────────────────────────────
  readonly state = signal<HomePageState>('idle');
  readonly errorKey = signal<string | null>(null);

  // ── Gates ──────────────────────────────────────────────────────────────
  readonly canSee = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_PAGE.bills }));
  readonly canApprove = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.apApprove }));
  readonly canManagePolicy = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.apPolicyManage }));
  readonly canPay = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.apPay }));
  readonly viewCode = ACCOUNTING_PAGE.bills[0];

  // ── Regions ────────────────────────────────────────────────────────────
  readonly counts = new HomeRegion<BillStageCounts>(ok => this.onCountsSettled(ok));
  readonly list = new HomeRegion<BillStagePage>(() => this.settlePage());

  readonly stages = BILL_STAGES;
  readonly stageKeys = STAGE_KEYS;
  readonly channelKeys = CHANNEL_KEYS;
  readonly channelIcons = CHANNEL_ICONS;
  readonly showTerms = this.preferences.showTerms;

  /** The chosen step; null until the first counts settle and pick the default. */
  readonly stage = signal<BillStage | null>(null);
  readonly page = signal(0);
  private readonly listKey = computed(() => {
    const stage = this.stage();
    return stage ? `${stage}:${this.page()}` : null;
  });

  readonly countsData = computed(() => (this.canSee() && !this.counts.denied() ? this.counts.data() : null));
  /** The list as last read for the current step and page (ADR-0063 §1). */
  readonly listData = computed(() =>
    this.canSee() && !this.list.denied() && this.list.dataKey() === this.listKey() ? this.list.data() : null,
  );

  /** The page's polite announcement, outside the routed panel so a navigation never drops it (ADR-0029 §8.8). */
  readonly announcement = signal<Copy | null>(null);

  private readonly selected = signal<string | null>(null);
  readonly selectedBillId = this.selected.asReadonly();
  private panelFocusOwed = false;

  /** `tid|sub` the held data belongs to; seeded so the effect's first run is not a change. */
  private trackedIdentity = this.identity();

  readonly statusKey = (row: BillStageRow): string => statusLabelKey(row.status, row.channel);
  readonly termKey = (row: BillStageRow): string | null => statusTermKey(row.status);
  readonly tone = statusTone;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.counts.dispose();
      this.list.dispose();
    });
    // ADR-0063 §7: another tenant or person invalidates every read in flight and clears the page.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.counts.reset();
        this.list.reset();
        this.announcement.set(null);
        this.stage.set(null);
        this.page.set(0);
        this.state.set('idle');
        this.errorKey.set(null);
        this.load();
      });
    });
    this.load();
  }

  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  // ── Loading ───────────────────────────────────────────────────────────
  private load(): void {
    if (!this.canSee()) {
      this.state.set('ready');
      this.errorKey.set(null);
      return;
    }
    this.state.set('loading');
    this.errorKey.set(null);
    this.loadCounts();
  }

  private loadCounts(): void {
    this.counts.load(this.payables.getStageCounts(), 'counts');
  }

  private loadList(): void {
    const stage = this.stage();
    const key = this.listKey();
    if (!stage || !key) return;
    this.list.load(this.payables.listByStage(stage, this.page()), key);
  }

  /** The first counts pick the default step; later ones only refresh the figures. */
  private onCountsSettled(ok: boolean): void {
    if (this.stage() !== null) return;
    const counts = ok ? this.counts.data() : null;
    this.stage.set(counts && counts.check === 0 && this.canApprove() ? 'APPROVE' : 'CHECK');
    this.loadList();
  }

  /**
   * `ready` once the list has answered; `error` only when it failed for a
   * reason other than authorization and nothing is held — a refused list names
   * its permission instead (ADR-0064 §4, §6).
   */
  private settlePage(): void {
    const status = this.list.status();
    if (status === 'PENDING') return;
    if (status === 'FAILED' && !this.list.denied() && !this.listData()) {
      this.state.set('error');
      this.errorKey.set('ACCOUNTING.BILLS.ERROR.LIST_LOAD');
      return;
    }
    this.state.set('ready');
    this.errorKey.set(null);
  }

  retryCounts(): void {
    this.loadCounts();
  }

  retryList(): void {
    this.state.set('loading');
    this.errorKey.set(null);
    this.loadList();
    this.focusAfterRender(() => this.listHeading()?.nativeElement.focus());
  }

  // ── Steps and paging ──────────────────────────────────────────────────
  selectStage(stage: BillStage): void {
    if (!this.canSee() || this.stage() === stage) return;
    this.stage.set(stage);
    this.page.set(0);
    this.loadList();
  }

  previousPage(): void {
    if (this.page() === 0) return;
    this.page.update(page => page - 1);
    this.loadList();
  }

  nextPage(): void {
    const data = this.listData();
    if (!data || this.page() + 1 >= data.totalPages) return;
    this.page.update(page => page + 1);
    this.loadList();
  }

  countFor(stage: BillStage, counts: BillStageCounts): number {
    switch (stage) {
      case 'CHECK':
        return counts.check;
      case 'APPROVE':
        return counts.approve;
      case 'PAY':
        return counts.pay;
      case 'DONE':
        return counts.done;
    }
  }

  // ── Selection (child route) ───────────────────────────────────────────
  /** Opens the bill's panel; on a phone the panel takes focus once it loads (§5.7). */
  pick(row: BillStageRow): void {
    if (!this.canSee()) return;
    this.panelFocusOwed = this.isSmallScreen();
    void this.router.navigate(['/app/accounting/bills', row.billId]);
  }

  // ── BillsPageLink ─────────────────────────────────────────────────────
  select(billId: string | null): void {
    this.selected.set(billId);
  }

  /** Every decision re-reads the counts and the list (story item 12). */
  billChanged(): void {
    if (!this.canSee()) return;
    if (!this.counts.denied()) this.loadCounts();
    if (!this.list.denied()) this.loadList();
  }

  /** Q5: the selection matched another bill; the step stays as chosen. */
  openMatched(selection: BillSelection): void {
    if (!this.canSee()) return;
    // Clear, then set after the next render, so an identical sentence is announced again (R2 item 4).
    const message = copy('ACCOUNTING.BILLS.DONE.MATCHED_OTHER', { number: selection.billNumber });
    this.announcement.set(null);
    this.focusAfterRender(() => this.announcement.set(message));
    void this.router.navigate(['/app/accounting/bills', selection.billId]);
  }

  takePanelFocus(): boolean {
    const owed = this.panelFocusOwed;
    this.panelFocusOwed = false;
    return owed;
  }

  isSmallScreen(): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(BILLS_SMALL_SCREEN_QUERY).matches
      : false;
  }

  private focusAfterRender(focus: () => void): void {
    afterNextRender(focus, { injector: this.injector });
  }
}
