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
import { Subscription, map, of, share } from 'rxjs';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { HelpDisclosureComponent } from '../../components/help-disclosure/help-disclosure.component';
import {
  ApApprovalPolicy,
  ApPolicyHistoryPage,
  ApPolicyHistoryRow,
  ApPolicyRead,
  ApPolicySetting,
  POLICY_REASON_MIN,
} from '../../models/ap-approval-policy.models';
import { HomePageState } from '../../models/accounting-home.models';
import { ApApprovalPolicyService } from '../../services/ap-approval-policy.service';
import { HomeRegion } from '../../utils/home-region';
import { uuidV7 } from '../../utils/uuid-v7.util';

/** A limit as typed: a non-negative amount with at most two decimals (§9.5). */
const AMOUNT = /^\d{1,13}(\.\d{1,2})?$/;

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
      return { key: 'ACCOUNTING.APPROVAL_LIMITS.SAVE.ERROR.VALIDATION', params: {}, fields: named };
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

/** How a history value renders: an amount through `| money`, a switch as On / Off, anything else as served text. */
export type HistoryValueKind = 'money' | 'switch' | 'terms' | 'text';

const SETTING_KEYS: Readonly<Record<ApPolicySetting, string>> = {
  AP_CLERK_APPROVAL_LIMIT: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_CLERK_APPROVAL_LIMIT',
  AP_AUTO_APPROVAL_LIMIT: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_AUTO_APPROVAL_LIMIT',
  AP_ALLOW_CREATOR_APPROVAL: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_ALLOW_CREATOR_APPROVAL',
  AP_ALLOW_APPROVER_PAYMENT: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_ALLOW_APPROVER_PAYMENT',
  AP_DEFAULT_TERMS: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.AP_DEFAULT_TERMS',
  UNKNOWN: 'ACCOUNTING.APPROVAL_LIMITS.HISTORY.SETTING.UNKNOWN',
};

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

function valueKind(setting: ApPolicySetting): HistoryValueKind {
  if (setting === 'AP_CLERK_APPROVAL_LIMIT' || setting === 'AP_AUTO_APPROVAL_LIMIT') return 'money';
  if (setting === 'AP_ALLOW_CREATOR_APPROVAL' || setting === 'AP_ALLOW_APPROVER_PAYMENT') return 'switch';
  if (setting === 'AP_DEFAULT_TERMS') return 'terms';
  return 'text';
}

/** A typed limit as a number, or null while it is not a valid amount. */
function parseAmount(text: string): number | null {
  const value = text.trim();
  return AMOUNT.test(value) ? Number(value) : null;
}

/**
 * Approval limits (CAP:550 S14; SPEC-accounting-workspace §5.5, §8.1 row
 * `settings/approval-limits`): the page shell with in-page links, the
 * **Bills** section, **Save your changes** and **History**. S21 adds the
 * Drawer cash and Petty-expense categories sections, their History sources and
 * the drawer save leg.
 *
 * - The policy and its history are separate regions with their own read status
 *   (ADR-0064), so S21 can merge other History sources.
 * - Nothing is computed from the limits: "What this means" quotes the typed
 *   values; the only comparison is the inline automatic ≤ clerk check (§9.5).
 * - Save sends one `updatePolicy` with the reason and a `requestId` made when
 *   the section first changes after its last confirmed save, reused on retry
 *   and rotated after a confirmed success or Undo (§8.2). The switches are shown
 *   read-only and never sent.
 * - Gate: `accounting:ap_approval_policy:manage` on the page, the Save control
 *   and its handler (ADR-0040 §6a).
 */
@Component({
  selector: 'app-approval-limits-page',
  standalone: true,
  imports: [DatePipe, MoneyPipe, RouterLink, TranslatePipe, HelpDisclosureComponent],
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
  private readonly destroyRef = inject(DestroyRef);

  private readonly billsHeading = viewChild<ElementRef<HTMLElement>>('billsHeading');
  private readonly historyHeading = viewChild<ElementRef<HTMLElement>>('historyHeading');

  // ── Page state (ADR-0031) ──────────────────────────────────────────────
  readonly state = signal<HomePageState>('idle');
  readonly errorKey = signal<string | null>(null);

  readonly canManage = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.apPolicyManage }));
  readonly manageCode = ACCOUNTING_PAGE.approvalLimits[0];
  readonly reasonMin = POLICY_REASON_MIN;

  // ── Regions ────────────────────────────────────────────────────────────
  readonly policy = new HomeRegion<ApApprovalPolicy>(ok => this.onPolicySettled(ok));
  readonly history = new HomeRegion<ApPolicyHistoryPage>();
  readonly historyPage = signal(0);

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

  // ── Save card (clean → dirty → saving → clean | dirty with error) ─────
  readonly saving = signal(false);
  readonly saveError = signal<PolicySaveError | null>(null);
  readonly announcement = signal<string | null>(null);
  readonly canSave = computed(
    () =>
      this.canManage() &&
      this.policy.status() === 'OK' &&
      this.billsDirty() &&
      this.billsValid() &&
      this.reasonValid() &&
      !this.saving(),
  );
  /**
   * The key last sent, bound to the payload it was sent with (review A1): a
   * retry of the identical payload reuses it (the server never applies it
   * twice); any edit gets a new one, because the server answers a known key
   * with the current policy and ignores the body. Dropped after a confirmed
   * success or Undo (§8.2).
   */
  private sent: { readonly requestId: string; readonly payload: string } | null = null;
  private saveSubscription: Subscription | null = null;
  private saveToken = 0;

  readonly settingKeys = SETTING_KEYS;
  readonly valueKind = valueKind;
  readonly roleKey = roleKey;
  readonly termsCopy = termsCopy;
  readonly actionPermissions = ACTION_PERMISSIONS;
  readonly rowKey = (row: ApPolicyHistoryRow, index: number): string => `${row.changedAt}|${row.setting}|${index}`;

  private trackedIdentity = this.identity();

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.policy.dispose();
      this.history.dispose();
      this.saveToken++;
      this.saveSubscription?.unsubscribe();
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
        this.historyPage.set(0);
        this.resetBills(null);
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
    if (!this.canManage()) {
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
    this.load();
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

  /** True while the fields hold typed text (not yet filled from a read). */
  private billsDirtyAgainstText(): boolean {
    return this.clerkText() !== '' || this.autoText() !== '';
  }

  private resetBills(policy: ApApprovalPolicy | null): void {
    this.clerkText.set(policy ? String(policy.clerkApprovalLimit) : '');
    this.autoText.set(policy ? String(policy.autoApprovalLimit) : '');
    this.reason.set('');
    this.saveError.set(null);
    this.sent = null;
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

  /** Undo changes: back to the last confirmed values; the key rotates (§8.2). */
  undo(): void {
    if (this.saving()) return;
    this.resetBills(this.baseline());
    this.announcement.set('ACCOUNTING.APPROVAL_LIMITS.SAVE.UNDONE');
  }

  /** Save, re-checked here: permission, a read policy, changed and valid values, a reason, nothing in flight. */
  save(): void {
    const base = this.baseline();
    const clerk = this.clerk();
    const auto = this.auto();
    if (!base || clerk === null || auto === null || !this.canSave()) return;
    const body = { clerkApprovalLimit: clerk, autoApprovalLimit: auto, currencyCode: base.currencyCode, justification: this.reason().trim() };
    const payload = JSON.stringify(body);
    const requestId = this.sent?.payload === payload ? this.sent.requestId : uuidV7();
    this.sent = { requestId, payload };
    const token = ++this.saveToken;
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSubscription = this.service
      .updatePolicy({ ...body, requestId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (read: ApPolicyRead) => {
          if (token !== this.saveToken) return;
          this.saving.set(false);
          // The served answer is the new baseline; the history's first page comes with it.
          this.policy.load(of(read.policy), 'policy');
          this.historyPage.set(0);
          this.history.load(of(read.history), 'history:0');
          this.resetBills(read.policy);
          this.announcement.set('ACCOUNTING.APPROVAL_LIMITS.SAVE.SAVED');
        },
        error: (error: unknown) => {
          if (token !== this.saveToken) return;
          this.saving.set(false);
          this.saveError.set(classifyPolicyError(error, base.currencyCode, this.manageCode));
        },
      });
  }

  fieldError(field: PolicyField): boolean {
    return !!this.saveError()?.fields.includes(field);
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
    this.loadHistory(this.historyPage());
  }

  historyPages(data: ApPolicyHistoryPage): number {
    return Math.max(1, Math.ceil(data.total / Math.max(1, data.size)));
  }

  // ── In-page links ─────────────────────────────────────────────────────
  /** The link keeps its `#fragment` href; focus moves to the section heading (the router does not scroll). */
  jumpTo(target: 'bills' | 'history'): void {
    const heading = (target === 'bills' ? this.billsHeading() : this.historyHeading())?.nativeElement;
    if (!heading) return;
    if (typeof heading.scrollIntoView === 'function') heading.scrollIntoView({ block: 'start' });
    heading.focus();
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
}
