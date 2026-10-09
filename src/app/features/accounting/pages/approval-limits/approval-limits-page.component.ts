import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription, catchError, forkJoin, map, of, share, take } from 'rxjs';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { DrawerCashSettingsComponent } from '../../components/drawer-cash-settings/drawer-cash-settings.component';
import { HelpDisclosureComponent } from '../../components/help-disclosure/help-disclosure.component';
import { PettyExpenseCategoriesComponent } from '../../components/petty-expense-categories/petty-expense-categories.component';
import {
  ApApprovalPolicy,
  ApPolicyHistoryPage,
  ApPolicyHistoryRow,
  ApPolicyRead,
  ApPolicySetting,
  POLICY_REASON_MIN,
} from '../../models/ap-approval-policy.models';
import { HomePageState, RegionStatus } from '../../models/accounting-home.models';
import { DrawerPolicy, DrawerPolicyHistoryRow, DrawerPolicyRead, DrawerPolicySetting } from '../../models/drawer-policy.models';
import { PettyExpenseCategory, PettyExpenseCategoryChange, PettyExpenseChangeType } from '../../models/petty-expense-categories.models';
import { ApApprovalPolicyService } from '../../services/ap-approval-policy.service';
import { DrawerPolicyService } from '../../services/drawer-policy.service';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { DrawerDraft, DrawerField, draftFrom, drawerDirty, drawerValid, parseAmount, rebaseDraft, toDrawerUpdate } from '../../utils/drawer-draft';
import { HomeRegion } from '../../utils/home-region';
import { uuidV7 } from '../../utils/uuid-v7.util';

/** The Bills fields a refusal can mark. */
export type PolicyField = 'clerkApprovalLimit' | 'autoApprovalLimit' | 'justification';

/** A classified save refusal (ADR-0017 codes, never the status alone). */
export interface PolicySaveError {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly fields: readonly PolicyField[];
}

const FIELDS: readonly PolicyField[] = ['clerkApprovalLimit', 'autoApprovalLimit', 'justification'];

/** Classifies a refused `updatePolicy` (story item 12, S13, S32d). */
export function classifyPolicyError(error: unknown, currency: string, permission: string): PolicySaveError {
  if (!(error instanceof HttpErrorResponse)) return { key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.UNKNOWN_OUTCOME', params: {}, fields: [] };
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as { code?: unknown; fieldErrors?: unknown };
  const code = typeof body.code === 'string' ? body.code : null;
  const named = Array.isArray(body.fieldErrors)
    ? body.fieldErrors
        .map(entry => (entry && typeof entry === 'object' ? (entry as { field?: unknown }).field : null))
        .filter((field): field is PolicyField => typeof field === 'string' && (FIELDS as readonly string[]).includes(field))
    : [];
  switch (code) {
    case 'JUSTIFICATION_REQUIRED':
      return { key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.JUSTIFICATION_REQUIRED', params: { min: POLICY_REASON_MIN }, fields: ['justification'] };
    case 'VALIDATION_ERROR':
      // "Check the highlighted fields" only when the refusal names one (ADR-0017 fieldErrors).
      return { key: `ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.${named.length ? 'VALIDATION' : 'VALIDATION_UNNAMED'}`, params: {}, fields: named };
    case 'AMOUNT_PRECISION_EXCEEDS_CURRENCY':
      return {
        key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.PRECISION',
        params: { currency },
        fields: named.length ? named : ['clerkApprovalLimit', 'autoApprovalLimit'],
      };
    case 'CURRENCY_NOT_SUPPORTED':
      return { key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.CURRENCY', params: { currency }, fields: [] };
    case 'FORBIDDEN':
      return { key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.FORBIDDEN', params: { permission }, fields: [] };
  }
  if (error.status === 403) return { key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.FORBIDDEN', params: { permission }, fields: [] };
  // The save may have landed: Save again resends the same requestId, which the server never applies twice (§8.2).
  if (error.status === 0 || error.status >= 500) return { key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.UNKNOWN_OUTCOME', params: {}, fields: [] };
  return { key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.OTHER', params: {}, fields: named };
}

/** A classified drawer save refusal (S16 codes). */
export interface DrawerSaveError {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly fields: readonly DrawerField[];
  /** The policy changed since it was read: the section re-reads, the typed values stay. */
  readonly reread: boolean;
}

const DRAWER_FIELDS: readonly DrawerField[] = ['pettyExpense.cashierLimit', 'vendorCod.cashierLimit', 'overShortTolerance', 'justification'];

/**
 * Classifies a refused `updateSessionPolicy` (S16; story #466 "Service
 * contracts"). A 422 `AMOUNT_PRECISION_EXCEEDS_CURRENCY` is shown, never
 * rounded (ADR-0067 PC-6).
 */
export function classifyDrawerError(error: unknown, currency: string, permission: string): DrawerSaveError {
  const view = (key: string, fields: readonly DrawerField[] = [], params: Record<string, unknown> = {}, reread = false): DrawerSaveError => ({
    key: `ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.${key}`,
    params,
    fields,
    reread,
  });
  if (!(error instanceof HttpErrorResponse)) return view('UNKNOWN_OUTCOME');
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as { code?: unknown; fieldErrors?: unknown };
  const code = typeof body.code === 'string' ? body.code : null;
  const named = Array.isArray(body.fieldErrors)
    ? body.fieldErrors
        .map(entry => (entry && typeof entry === 'object' ? (entry as { field?: unknown }).field : null))
        .filter((field): field is DrawerField => typeof field === 'string' && (DRAWER_FIELDS as readonly string[]).includes(field))
    : [];
  switch (code) {
    case 'VALIDATION_ERROR':
      return view(named.length ? 'VALIDATION' : 'VALIDATION_UNNAMED', named);
    case 'SESSION_POLICY_CONFLICT':
      return view('DRAWER_CONFLICT', [], {}, true);
    case 'AMOUNT_PRECISION_EXCEEDS_CURRENCY':
      return view('PRECISION', named.length ? named : ['pettyExpense.cashierLimit', 'vendorCod.cashierLimit', 'overShortTolerance'], { currency });
    case 'CURRENCY_NOT_SUPPORTED':
      return view('CURRENCY', [], { currency });
    case 'FORBIDDEN':
      return view('FORBIDDEN', [], { permission });
  }
  if (error.status === 403) return view('FORBIDDEN', [], { permission });
  if (error.status === 409) return view('DRAWER_CONFLICT', [], {}, true);
  // A full replacement against the version read: Save again either applies it once or answers 409 (S16).
  if (error.status === 0 || error.status >= 500) return view('UNKNOWN_OUTCOME');
  return view('OTHER', named);
}

/** How a history value renders: an amount through `| money`, a switch as On / Off, anything else as served text. */
export type HistoryValueKind = 'money' | 'switch' | 'terms' | 'text';

const SETTING_KEYS: Readonly<Record<ApPolicySetting | DrawerPolicySetting, string>> = {
  AP_CLERK_APPROVAL_LIMIT: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_CLERK_APPROVAL_LIMIT',
  AP_AUTO_APPROVAL_LIMIT: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_AUTO_APPROVAL_LIMIT',
  AP_ALLOW_CREATOR_APPROVAL: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_ALLOW_CREATOR_APPROVAL',
  AP_ALLOW_APPROVER_PAYMENT: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_ALLOW_APPROVER_PAYMENT',
  AP_DEFAULT_TERMS: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_DEFAULT_TERMS',
  PETTY_EXPENSE_ALLOWED: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.PETTY_EXPENSE_ALLOWED',
  PETTY_EXPENSE_LIMIT: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.PETTY_EXPENSE_LIMIT',
  VENDOR_COD_ALLOWED: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.VENDOR_COD_ALLOWED',
  VENDOR_COD_LIMIT: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.VENDOR_COD_LIMIT',
  OVER_SHORT_TOLERANCE: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.OVER_SHORT_TOLERANCE',
  UNKNOWN: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.UNKNOWN',
};

const CATEGORY_CHANGE_KEYS: Readonly<Record<PettyExpenseChangeType, string>> = {
  CREATE: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.CATEGORY_CHANGE.CREATE',
  RELABEL: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.CATEGORY_CHANGE.RELABEL',
  DEACTIVATE: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.CATEGORY_CHANGE.DEACTIVATE',
  REMAP: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.CATEGORY_CHANGE.REMAP',
  UNKNOWN: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.CATEGORY_CHANGE.UNKNOWN',
};

/** A History source: each keeps its own read status (ADR-0064). */
export type HistorySource = 'BILLS' | 'DRAWER' | 'CATEGORIES';

/** One merged History row, tagged with the source that served it. */
export type MergedHistoryRow =
  | { readonly source: 'BILLS'; readonly changedAt: string; readonly row: ApPolicyHistoryRow }
  | { readonly source: 'DRAWER'; readonly changedAt: string; readonly row: DrawerPolicyHistoryRow }
  | { readonly source: 'CATEGORIES'; readonly changedAt: string; readonly row: PettyExpenseCategoryChange; readonly category: string };

/** Newest first by the served instant; an unreadable instant sorts last; ties keep the served order. */
export function mergeHistory(rows: readonly MergedHistoryRow[]): MergedHistoryRow[] {
  const at = (value: string): number => {
    const time = Date.parse(value);
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
  };
  return rows
    .map((row, index) => ({ row, index, time: at(row.changedAt) }))
    .sort((a, b) => (b.time === a.time ? a.index - b.index : b.time > a.time ? 1 : -1))
    .map(entry => entry.row);
}

const instant = (value: string | undefined): number => {
  const time = value === undefined ? Number.NaN : Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

/**
 * The drawer and category rows bill page `page` shows (Accounting ruling Q1 on
 * #466): those with `oldest(page) ≤ changedAt < oldest(page − 1)`; page 0 has
 * no upper bound and the last page no lower bound, so each row appears on
 * exactly one page and the pages read newest first across them. Without a
 * paged bill source every row shows.
 */
export function historyWindow(
  rows: readonly MergedHistoryRow[],
  bills: ApPolicyHistoryPage | null,
  page: number,
  oldestByPage: Readonly<Record<number, string>>,
): MergedHistoryRow[] {
  if (!bills) return [...rows];
  const pages = Math.max(1, Math.ceil(bills.total / Math.max(1, bills.size)));
  if (pages <= 1) return [...rows];
  const last = page >= pages - 1;
  const oldestHere = bills.rows.length ? bills.rows[bills.rows.length - 1].changedAt : undefined;
  const lower = last || oldestHere === undefined ? Number.NEGATIVE_INFINITY : instant(oldestHere);
  const upper = page === 0 || oldestByPage[page - 1] === undefined ? Number.POSITIVE_INFINITY : instant(oldestByPage[page - 1]);
  return rows.filter(row => {
    const at = instant(row.changedAt);
    return at >= lower && at < upper;
  });
}

/** Role codes the history names, through translated labels; any other reads "Another role" (review B5, Q4). */
const ROLE_KEYS: Readonly<Record<string, string>> = {
  ACCOUNTING_CLERK: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.ACCOUNTING_CLERK',
  CONTROLLER: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.CONTROLLER',
  GENERAL_MANAGER: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.GENERAL_MANAGER',
  ADMIN: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.ADMIN',
  SYSTEM_ADMINISTRATOR: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.SYSTEM_ADMINISTRATOR',
};

export function roleKey(code: string): string {
  return ROLE_KEYS[code.replace(/^ROLE_/, '')] ?? 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.ROLE.UNKNOWN';
}

/** Payment terms as served (`DUE_ON_RECEIPT`, `NET<n>`) through translated copy; anything else "Unknown". */
export function termsCopy(value: string | null): { readonly key: string; readonly params: Readonly<Record<string, unknown>> } {
  if (value === 'DUE_ON_RECEIPT') return { key: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.TERMS.DUE_ON_RECEIPT', params: {} };
  const net = value ? /^NET(\d{1,3})$/.exec(value) : null;
  if (net) return { key: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.TERMS.NET', params: { days: Number(net[1]) } };
  return { key: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.TERMS.UNKNOWN', params: {} };
}

/**
 * Who can do what (Accounting ruling Q3 on #464): each action and the
 * permission its endpoint enforces, mirroring the ADR-0040 §6a gates. Which
 * roles hold each permission is tenant data, served later (S14b).
 */
export const ACTION_PERMISSIONS: readonly { readonly labelKey: string; readonly code: string }[] = [
  { labelKey: 'ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.SEND_AND_APPROVE', code: 'accounting:ap:approve' },
  { labelKey: 'ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.APPROVE_ANY', code: 'accounting:ap:approve_over_limit' },
  { labelKey: 'ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.REJECT', code: ACCOUNTING_SECTION.apReject[0] },
  { labelKey: 'ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.PAY', code: ACCOUNTING_SECTION.apPay[0] },
  { labelKey: 'ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.SET_LIMITS', code: ACCOUNTING_SECTION.apPolicyManage[0] },
];

function valueKind(setting: ApPolicySetting | DrawerPolicySetting): HistoryValueKind {
  switch (setting) {
    case 'AP_CLERK_APPROVAL_LIMIT':
    case 'AP_AUTO_APPROVAL_LIMIT':
    case 'PETTY_EXPENSE_LIMIT':
    case 'VENDOR_COD_LIMIT':
    case 'OVER_SHORT_TOLERANCE':
      return 'money';
    case 'AP_ALLOW_CREATOR_APPROVAL':
    case 'AP_ALLOW_APPROVER_PAYMENT':
    case 'PETTY_EXPENSE_ALLOWED':
    case 'VENDOR_COD_ALLOWED':
      return 'switch';
    case 'AP_DEFAULT_TERMS':
      return 'terms';
    default:
      return 'text';
  }
}


/** One save leg's outcome, collected before reporting (§5.5, §9.5). */
type LegOutcome =
  | { readonly leg: 'BILLS'; readonly ok: true; readonly read: ApPolicyRead }
  | { readonly leg: 'BILLS'; readonly ok: false; readonly error: unknown }
  | { readonly leg: 'DRAWER'; readonly ok: true; readonly read: DrawerPolicyRead }
  | { readonly leg: 'DRAWER'; readonly ok: false; readonly error: unknown };

/**
 * Approval limits (CAP:550 S14 / S21; SPEC-accounting-workspace §5.5, §8.1 row
 * `settings/approval-limits`): the page shell with in-page links, the
 * **Bills**, **Drawer cash** and **Petty-expense categories** sections, the
 * **Save your changes** card and the merged **History**.
 *
 * - Each section gates on the code its endpoints enforce (ADR-0040 §6a): Bills
 *   `apPolicyManage`, Drawer cash `drawerPolicy`, categories `categoryView`
 *   (writes inside the section). The page admits any of §8.1's codes. A section
 *   the person cannot read (or that answers 403) is absent, with its link.
 * - Bills, the drawer policy and the categories are separate regions with
 *   their own read status and sequence (ADR-0063, ADR-0064); a section re-read
 *   never discards another section's unsaved edits.
 * - Nothing is computed from the limits: "What this means" quotes the typed
 *   values; the only comparison is the inline automatic ≤ clerk check (§9.5).
 * - Save tracks bill and drawer changes separately and sends only the changed
 *   legs, each with the shared reason, and collects both outcomes before
 *   reporting. Bills: one `updatePolicy` with a `requestId` bound to the sent
 *   payload (§8.2). Drawer cash: one full replacement through pos-order, which
 *   writes nothing when unchanged and answers 409 on a race. A failed leg stays
 *   dirty, so Save retries only it.
 * - History merges the bill history page, the drawer history and the category
 *   changes, newest first; each source keeps its own read status. Usernames are
 *   never shown (Accounting ruling Q4 on #464): bill rows show translated
 *   roles; drawer and category rows serve no role.
 */
@Component({
  selector: 'app-approval-limits-page',
  standalone: true,
  imports: [DatePipe, MoneyPipe, RouterLink, TranslatePipe, HelpDisclosureComponent, DrawerCashSettingsComponent, PettyExpenseCategoriesComponent],
  templateUrl: './approval-limits-page.component.html',
  styleUrls: [
    '../../bank-reconciliation-shared.css',
    '../../components/bills/bills-shared.css',
    './approval-limits-page.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApprovalLimitsPageComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(ApApprovalPolicyService);
  private readonly drawerService = inject(DrawerPolicyService);
  private readonly categoriesService = inject(PettyExpenseCategoriesService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly billsHeading = viewChild<ElementRef<HTMLElement>>('billsHeading');
  private readonly historyHeading = viewChild<ElementRef<HTMLElement>>('historyHeading');
  private readonly drawerSection = viewChild(DrawerCashSettingsComponent);
  private readonly categoriesSection = viewChild(PettyExpenseCategoriesComponent);

  // ── Page state (ADR-0031) ──────────────────────────────────────────────
  readonly state = signal<HomePageState>('idle');
  readonly errorKey = signal<string | null>(null);

  /** §8.1's any-of gate, as on the route. */
  readonly canSeePage = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_PAGE.approvalLimits }));
  readonly canManage = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.apPolicyManage }));
  readonly canDrawer = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.drawerPolicy }));
  readonly canCategories = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.categoryView }));
  readonly manageCode = ACCOUNTING_SECTION.apPolicyManage[0];
  readonly drawerCode = ACCOUNTING_SECTION.drawerPolicy[0];
  readonly pageCodes = ACCOUNTING_PAGE.approvalLimits.join(', ');
  /** The codes a section is read with: Bills, Drawer cash and the category list. */
  readonly readCodes = [ACCOUNTING_SECTION.apPolicyManage[0], ACCOUNTING_SECTION.drawerPolicy[0], ACCOUNTING_SECTION.categoryView[0]].join(', ');
  /**
   * Admitted by §8.1's gate (e.g. `accounting:mapping-key:edit` alone) but able
   * to read no section: the page says which codes read one instead of showing
   * an empty page.
   */
  readonly nothingReadable = computed(() => this.canSeePage() && !this.canManage() && !this.canDrawer() && !this.canCategories());
  readonly reasonMin = POLICY_REASON_MIN;

  // ── Regions ────────────────────────────────────────────────────────────
  readonly policy = new HomeRegion<ApApprovalPolicy>(ok => this.onPolicySettled(ok));
  readonly history = new HomeRegion<ApPolicyHistoryPage>();
  readonly historyPage = signal(0);
  readonly drawer = new HomeRegion<DrawerPolicyRead>(ok => this.onDrawerSettled(ok));
  readonly categories = new HomeRegion<PettyExpenseCategory[]>();

  readonly baseline = computed(() => (this.canManage() && !this.policy.denied() ? this.policy.data() : null));
  readonly historyData = computed(() =>
    this.canManage() && !this.history.denied() && this.history.dataKey() === `history:${this.historyPage()}`
      ? this.history.data()
      : null,
  );

  // ── Bills section ─────────────────────────────────────────────────────
  readonly clerkText = signal('');
  readonly autoText = signal('');
  readonly reason = signal('');

  readonly clerk = computed(() => parseAmount(this.clerkText()));
  readonly auto = computed(() => parseAmount(this.autoText()));
  readonly clerkInvalid = computed(() => this.clerk() === null);
  readonly autoInvalid = computed(() => this.auto() === null);
  /** The typed automatic value above the typed clerk value (§9.5). */
  readonly autoAboveClerk = computed(() => {
    const clerk = this.clerk();
    const auto = this.auto();
    return clerk !== null && auto !== null && auto > clerk;
  });
  readonly billsDirty = computed(() => {
    const base = this.baseline();
    if (!base) return false;
    const clerk = this.clerk();
    const auto = this.auto();
    return clerk !== base.clerkApprovalLimit || auto !== base.autoApprovalLimit;
  });
  readonly billsValid = computed(() => !this.clerkInvalid() && !this.autoInvalid() && !this.autoAboveClerk());
  readonly reasonValid = computed(() => this.reason().trim().length >= POLICY_REASON_MIN);

  // ── Drawer cash section ───────────────────────────────────────────────
  /** The served policy the drawer section shows (kept over a failed re-read, ADR-0064 §2). */
  readonly drawerPolicy = computed<DrawerPolicy | null>(() =>
    this.canDrawer() && !this.drawer.denied() ? (this.drawer.data()?.policy ?? null) : null,
  );
  readonly drawerDraft = signal<DrawerDraft | null>(null);
  /** The section renders once a read answered; its fields edit only while the read is current. */
  readonly drawerShown = computed(() => this.drawerPolicy() !== null && this.drawerDraft() !== null);
  readonly drawerCurrent = computed(() => this.drawerShown() && this.drawer.status() === 'OK');
  readonly drawerDirty = computed(() => {
    const policy = this.drawerPolicy();
    const draft = this.drawerDraft();
    return this.drawerCurrent() && !!policy && !!draft && drawerDirty(draft, policy);
  });
  readonly drawerValid = computed(() => {
    const policy = this.drawerPolicy();
    const draft = this.drawerDraft();
    return !this.drawerCurrent() || (!!policy && !!draft && drawerValid(draft, policy));
  });
  /** The policy the draft was filled from: a re-read refreshes a clean draft, never an edited one. */
  private drawerDraftSource: DrawerPolicy | null = null;

  readonly categoriesShown = computed(() => this.canCategories() && !this.categories.denied());
  readonly categoryRows = computed(() => (this.categoriesShown() ? this.categories.data() : null));

  // ── Save card (clean → dirty → saving → clean | partial | dirty with error) ──
  readonly saving = signal(false);
  readonly saveError = signal<PolicySaveError | null>(null);
  readonly drawerSaveError = signal<DrawerSaveError | null>(null);
  /** In a mixed outcome, the leg that was saved (the other's message names it). */
  readonly partialSaved = signal<'BILLS' | 'DRAWER' | null>(null);
  readonly announcement = signal<string | null>(null);
  readonly saveShown = computed(() => this.baseline() !== null || this.drawerShown());
  readonly anyDirty = computed(() => this.billsDirty() || this.drawerDirty());
  readonly canSave = computed(
    () =>
      ((this.canManage() && this.policy.status() === 'OK' && this.billsDirty()) || (this.canDrawer() && this.drawerDirty())) &&
      (this.baseline() === null || this.billsValid()) &&
      this.drawerValid() &&
      this.reasonValid() &&
      !this.saving(),
  );
  /**
   * The bill key last sent, bound to the payload it was sent with (review A1): a
   * retry of the identical payload reuses it (the server never applies it
   * twice); any edit gets a new one, because the server answers a known key
   * with the current policy and ignores the body. Dropped after a confirmed
   * success or Undo (§8.2).
   */
  private sent: { readonly requestId: string; readonly payload: string } | null = null;
  private saveSubscription: Subscription | null = null;
  private saveToken = 0;

  readonly settingKeys = SETTING_KEYS;
  readonly categoryChangeKeys = CATEGORY_CHANGE_KEYS;
  readonly valueKind = valueKind;
  readonly roleKey = roleKey;
  readonly termsCopy = termsCopy;
  readonly actionPermissions = ACTION_PERMISSIONS;
  readonly rowKey = (row: MergedHistoryRow, index: number): string => `${row.source}|${row.changedAt}|${index}`;

  // ── History ───────────────────────────────────────────────────────────
  /** The sources this session reads, each with its own status. */
  readonly historySources = computed(() => {
    const sources: { readonly source: HistorySource; readonly status: RegionStatus }[] = [];
    if (this.canManage() && !this.history.denied()) sources.push({ source: 'BILLS', status: this.history.status() });
    if (this.canDrawer() && !this.drawer.denied()) sources.push({ source: 'DRAWER', status: this.drawer.status() });
    if (this.categoriesShown()) sources.push({ source: 'CATEGORIES', status: this.categories.status() });
    return sources;
  });
  /** The oldest bill row's instant of each bill page, remembered as each page arrives (Accounting ruling Q1 on #466). */
  private readonly oldestByPage = signal<Readonly<Record<number, string>>>({});
  readonly historyRows = computed(() => {
    const bills = this.historyData();
    const others: MergedHistoryRow[] = [];
    if (this.canDrawer() && !this.drawer.denied()) {
      for (const row of this.drawer.data()?.history ?? []) others.push({ source: 'DRAWER', changedAt: row.changedAt, row });
    }
    for (const category of this.categoryRows() ?? []) {
      for (const row of category.history) others.push({ source: 'CATEGORIES', changedAt: row.changedAt, row, category: category.label });
    }
    const billRows: MergedHistoryRow[] = (bills?.rows ?? []).map(row => ({ source: 'BILLS', changedAt: row.changedAt, row }));
    return mergeHistory([...billRows, ...historyWindow(others, bills, this.historyPage(), this.oldestByPage())]);
  });
  readonly historyPending = computed(() => this.historySources().some(source => source.status === 'PENDING'));
  readonly historyAllOk = computed(() => this.historySources().length > 0 && this.historySources().every(source => source.status === 'OK'));

  private trackedIdentity = this.identity();

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.policy.dispose();
      this.history.dispose();
      this.drawer.dispose();
      this.categories.dispose();
      this.saveToken++;
      this.saveSubscription?.unsubscribe();
    });
    // Remember each bill page's oldest instant as it arrives; the next page's window starts below it.
    effect(() => {
      const data = this.historyData();
      const page = this.historyPage();
      if (!data || !data.rows.length) return;
      const oldest = data.rows[data.rows.length - 1].changedAt;
      untracked(() => this.oldestByPage.update(known => (known[page] === oldest ? known : { ...known, [page]: oldest })));
    });
    // ADR-0063 §7: another tenant or person invalidates every read in flight and clears the page.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.saveToken++;
        this.saveSubscription?.unsubscribe();
        this.saving.set(false);
        this.policy.reset();
        this.history.reset();
        this.drawer.reset();
        this.categories.reset();
        this.historyPage.set(0);
        this.oldestByPage.set({});
        this.resetBills(null);
        this.resetDrawer(null);
        this.partialSaved.set(null);
        this.load();
      });
    });
    this.load();
  }

  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  /** The key last sent and not yet confirmed, for tests and the PR evidence; never shown. */
  currentRequestId(): string | null {
    return this.sent?.requestId ?? null;
  }

  // ── Loading ───────────────────────────────────────────────────────────
  private load(): void {
    if (this.canDrawer()) this.loadDrawer();
    if (this.canCategories()) this.loadCategories();
    if (!this.canManage()) {
      // The page-level state names the Bills read only; the other sections carry their own.
      this.state.set('ready');
      this.errorKey.set(null);
      return;
    }
    this.state.set('loading');
    this.errorKey.set(null);
    const read$ = this.service.getPolicy(0).pipe(share());
    this.policy.load(read$.pipe(map(read => read.policy)), 'policy');
    this.history.load(read$.pipe(map(read => read.history)), 'history:0');
    this.historyPage.set(0);
  }

  retry(): void {
    if (!this.canManage()) return;
    this.state.set('loading');
    this.errorKey.set(null);
    const read$ = this.service.getPolicy(0).pipe(share());
    this.policy.load(read$.pipe(map(read => read.policy)), 'policy');
    this.history.load(read$.pipe(map(read => read.history)), 'history:0');
    this.historyPage.set(0);
  }

  loadDrawer(): void {
    if (!this.canDrawer()) return;
    this.drawer.load(this.drawerService.getPolicy(), 'drawer');
  }

  loadCategories(): void {
    if (!this.canCategories()) return;
    this.categories.load(this.categoriesService.list(), 'categories');
  }

  private onPolicySettled(ok: boolean): void {
    if (ok) {
      // A first read (or one after Undo) fills the fields; typed values are never overwritten.
      if (this.sent === null && !this.billsDirtyAgainstText()) this.resetBills(this.policy.data());
      this.state.set('ready');
      this.errorKey.set(null);
      return;
    }
    if (this.policy.denied() || this.policy.data()) {
      this.state.set('ready');
      this.errorKey.set(null);
      return;
    }
    this.state.set('error');
    this.errorKey.set('ACCOUNTING.APPROVAL_LIMITS.LOAD_FAILED');
  }

  /**
   * A drawer read fills a first draft; over a re-read (after a 409) the draft is
   * rebased field by field: untouched fields take the new served values, edited
   * ones keep what was typed, so Save never writes back someone else's change.
   */
  private onDrawerSettled(ok: boolean): void {
    const served = this.drawer.data()?.policy ?? null;
    if (!ok || !served) return;
    const draft = this.drawerDraft();
    const source = this.drawerDraftSource;
    this.drawerDraft.set(draft === null || source === null ? draftFrom(served) : rebaseDraft(draft, source, served));
    this.drawerDraftSource = served;
  }

  /** True while the fields hold typed text (not yet filled from a read). */
  private billsDirtyAgainstText(): boolean {
    return this.clerkText() !== '' || this.autoText() !== '';
  }

  private resetBills(policy: ApApprovalPolicy | null, keepReason = false): void {
    this.clerkText.set(policy ? String(policy.clerkApprovalLimit) : '');
    this.autoText.set(policy ? String(policy.autoApprovalLimit) : '');
    if (!keepReason) this.reason.set('');
    this.saveError.set(null);
    this.sent = null;
  }

  private resetDrawer(policy: DrawerPolicy | null): void {
    this.drawerDraft.set(policy ? draftFrom(policy) : null);
    this.drawerDraftSource = policy;
    this.drawerSaveError.set(null);
  }

  // ── Editing ───────────────────────────────────────────────────────────
  setClerk(value: string): void {
    this.clerkText.set(value);
  }

  setAuto(value: string): void {
    this.autoText.set(value);
  }

  setReason(value: string): void {
    this.reason.set(value);
  }

  setDrawerDraft(draft: DrawerDraft): void {
    if (this.saving() || !this.canDrawer()) return;
    this.drawerDraft.set(draft);
  }

  /** Undo changes: both sections back to their last served values; the bill key rotates (§8.2). */
  undo(): void {
    if (this.saving()) return;
    this.resetBills(this.baseline());
    this.resetDrawer(this.drawerPolicy());
    this.partialSaved.set(null);
    this.announcement.set('ACCOUNTING.APPROVAL_LIMITS.SAVE.UNDONE');
  }

  /**
   * Save, re-checked here: each leg's permission, a current read, changed and
   * valid values, a reason, nothing in flight. Only the changed legs are sent;
   * both outcomes are collected before reporting.
   */
  save(): void {
    if (!this.canSave()) return;
    const justification = this.reason().trim();
    const legs: Observable<LegOutcome>[] = [];

    const base = this.baseline();
    const clerk = this.clerk();
    const auto = this.auto();
    if (this.canManage() && base && this.billsDirty() && clerk !== null && auto !== null) {
      const body = { clerkApprovalLimit: clerk, autoApprovalLimit: auto, currencyCode: base.currencyCode, justification };
      const payload = JSON.stringify(body);
      const requestId = this.sent?.payload === payload ? this.sent.requestId : uuidV7();
      this.sent = { requestId, payload };
      legs.push(
        this.service.updatePolicy({ ...body, requestId }).pipe(
          take(1),
          map((read): LegOutcome => ({ leg: 'BILLS', ok: true, read })),
          catchError((error: unknown) => of<LegOutcome>({ leg: 'BILLS', ok: false, error })),
        ),
      );
    }

    const drawerPolicy = this.drawerPolicy();
    const draft = this.drawerDraft();
    const update = this.canDrawer() && this.drawerDirty() && drawerPolicy && draft ? toDrawerUpdate(draft, drawerPolicy, justification) : null;
    if (update) {
      legs.push(
        this.drawerService.updatePolicy(update).pipe(
          take(1),
          map((read): LegOutcome => ({ leg: 'DRAWER', ok: true, read })),
          catchError((error: unknown) => of<LegOutcome>({ leg: 'DRAWER', ok: false, error })),
        ),
      );
    }
    if (!legs.length) return;

    const token = ++this.saveToken;
    this.saving.set(true);
    this.saveError.set(null);
    this.drawerSaveError.set(null);
    this.partialSaved.set(null);
    this.announcement.set(null);
    this.saveSubscription = forkJoin(legs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(outcomes => {
        if (token !== this.saveToken) return;
        this.saving.set(false);
        this.settleSave(outcomes);
      });
  }

  private settleSave(outcomes: readonly LegOutcome[]): void {
    const failed = outcomes.some(outcome => !outcome.ok);
    const saved = outcomes.filter(outcome => outcome.ok).map(outcome => outcome.leg);
    for (const outcome of outcomes) {
      if (outcome.leg === 'BILLS') {
        if (outcome.ok) {
          // The served answer is the new baseline; the history's first page comes with it.
          this.policy.load(of(outcome.read.policy), 'policy');
          this.historyPage.set(0);
          this.history.load(of(outcome.read.history), 'history:0');
          this.resetBills(outcome.read.policy, failed);
        } else {
          this.saveError.set(classifyPolicyError(outcome.error, this.baseline()?.currencyCode ?? '', this.manageCode));
        }
      } else if (outcome.ok) {
        this.resetDrawer(null);
        this.drawer.load(of(outcome.read), 'drawer');
      } else {
        const error = classifyDrawerError(outcome.error, this.drawerPolicy()?.currencyCode ?? '', this.drawerCode);
        this.drawerSaveError.set(error);
        // The policy moved: re-read it; the typed values stay and Save compares them with the new one.
        if (error.reread) this.loadDrawer();
      }
    }
    if (!failed) {
      this.reason.set('');
      this.announcement.set('ACCOUNTING.APPROVAL_LIMITS.SAVE.SAVED');
      return;
    }
    this.partialSaved.set(saved.length === 1 && outcomes.length === 2 ? saved[0] : null);
  }

  fieldError(field: PolicyField): boolean {
    return !!this.saveError()?.fields.includes(field);
  }

  drawerFieldError(field: DrawerField): boolean {
    return !!this.drawerSaveError()?.fields.includes(field);
  }

  /** The drawer leg's message: "couldn't be confirmed" for an unknown outcome, "weren't saved" for a refusal. */
  drawerMessageKey(failure: DrawerSaveError): string {
    const unconfirmed = failure.key.endsWith('UNKNOWN_OUTCOME');
    if (this.partialSaved() === 'BILLS') {
      return `ACCOUNTING.APPROVAL_LIMITS.SAVE.PARTIAL.${unconfirmed ? 'DRAWER_UNCONFIRMED' : 'DRAWER_FAILED'}`;
    }
    return `ACCOUNTING.APPROVAL_LIMITS.SAVE.${unconfirmed ? 'DRAWER_UNCONFIRMED' : 'DRAWER_FAILED'}`;
  }

  /** The bill leg's message in a mixed outcome. */
  billsPartialKey(failure: PolicySaveError): string {
    return `ACCOUNTING.APPROVAL_LIMITS.SAVE.PARTIAL.${failure.key.endsWith('UNKNOWN_OUTCOME') ? 'BILLS_UNCONFIRMED' : 'BILLS_FAILED'}`;
  }

  reasonDescribedBy(): string {
    return (
      'limits-reason-hint' +
      (this.saveError() ? ' limits-save-error' : '') +
      (this.drawerSaveError() ? ' limits-drawer-save-error' : '')
    );
  }

  // ── History ───────────────────────────────────────────────────────────
  private loadHistory(page: number): void {
    this.historyPage.set(page);
    this.history.load(this.service.getPolicy(page).pipe(map(read => read.history)), `history:${page}`);
  }

  previousHistory(): void {
    if (this.historyPage() === 0) return;
    this.loadHistory(this.historyPage() - 1);
  }

  nextHistory(): void {
    const data = this.historyData();
    if (!data || (this.historyPage() + 1) * data.size >= data.total) return;
    this.loadHistory(this.historyPage() + 1);
  }

  retryHistory(): void {
    if (!this.canManage()) return;
    this.loadHistory(this.historyPage());
  }

  /** Retry one History source; drawer and category history come with their section's read. */
  retrySource(source: HistorySource): void {
    if (source === 'BILLS') this.retryHistory();
    else if (source === 'DRAWER') this.loadDrawer();
    else this.loadCategories();
  }

  historyPages(data: ApPolicyHistoryPage): number {
    return Math.max(1, Math.ceil(data.total / Math.max(1, data.size)));
  }

  /** On / Off for a served switch or category status value; an empty or unknown value reads as a dash. */
  switchLabel(value: string | null): string {
    if (value === 'true' || value === 'ACTIVE') return 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.ON';
    if (value === 'false' || value === 'INACTIVE') return 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.OFF';
    return 'COMMON.EMPTY_VALUE';
  }

  // ── In-page links ─────────────────────────────────────────────────────
  /** The link keeps its `#fragment` href; focus moves to the section heading (the router does not scroll). */
  jumpTo(target: 'bills' | 'drawer' | 'categories' | 'history'): void {
    if (target === 'drawer') {
      this.drawerSection()?.focusHeading();
      return;
    }
    if (target === 'categories') {
      this.categoriesSection()?.focusHeading();
      return;
    }
    const heading = (target === 'bills' ? this.billsHeading() : this.historyHeading())?.nativeElement;
    if (!heading) return;
    if (typeof heading.scrollIntoView === 'function') heading.scrollIntoView({ block: 'start' });
    heading.focus();
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
