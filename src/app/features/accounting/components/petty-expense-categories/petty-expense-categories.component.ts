import { DatePipe, DecimalPipe } from '@angular/common';
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
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription } from 'rxjs';
import { canAccess } from '../../../../core/security/route-access';
import { ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { RegionStatus } from '../../models/accounting-home.models';
import {
  InputTaxRecovery,
  RecoveryCategory,
  SHARE_CHOICES,
  SHARE_REASON_MIN,
  ShareChoice,
  TaxShareCommand,
  choiceOf,
  drawerEvidenceThreshold,
  recoveryState,
} from '../../models/input-tax-recovery.models';
import {
  CATEGORY_CODE_PATTERN,
  CATEGORY_EXAMPLES_MAX,
  CATEGORY_LABEL_MAX,
  CATEGORY_REASON_MIN,
  ExpenseAccountOption,
  PettyExpenseAccount,
  PettyExpenseCategory,
} from '../../models/petty-expense-categories.models';
import { AccountingPreferencesService } from '../../services/accounting-preferences.service';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { toDatePipeInput } from '../../utils/date-only.util';
import { uuidV7 } from '../../utils/uuid-v7.util';
import { CategoryDialogMode, CategoryFailure, CategoryField, classifyCategoryError } from './category-errors';
import { HelpDisclosureComponent } from '../help-disclosure/help-disclosure.component';
import { TaxRegistrationsPanelComponent } from '../tax-registrations-panel/tax-registrations-panel.component';
import { ShareFailure, ShareField, classifyShareError } from './tax-share-errors';

/** The Change share dialog (CAP:550 S33): the category it acts on and the setting version read. */
interface ShareDialog {
  readonly code: string;
  readonly label: string;
  /** The setting version read when the dialog opened, refreshed by a re-read after a refusal; sent with the change. */
  readonly version: number;
}

/** Where focus returns after a success: a category dialog's row action, or the row's Change share. */
type FocusMode = CategoryDialogMode | 'TAX_SHARE';

/** How a category's share reads in the column (§5.5, §8.2): a fixed phrase, a served percentage, or Unknown. */
export interface ShareCopy {
  readonly key: string;
  /** The served percentage, formatted in the user's locale by the template; null for the fixed phrases. */
  readonly percent: number | null;
}

const SHARE_KEY = 'ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.';

/** The served setting as the column says it; a code the read does not know reads "Unknown" (§8.2). */
export function shareCopy(row: Pick<RecoveryCategory, 'taxRecoverable' | 'recoverablePercent'> | null | undefined): ShareCopy {
  if (!row) return { key: SHARE_KEY + 'UNKNOWN', percent: null };
  const choice = choiceOf(row);
  if (choice) return { key: SHARE_KEY + choice, percent: null };
  return row.recoverablePercent === null ? { key: SHARE_KEY + 'UNKNOWN', percent: null } : { key: SHARE_KEY + 'PERCENT', percent: row.recoverablePercent };
}

/** The command each offered share sends (§5.5): Not claimed, Half (50%), All of it. */
const SHARE_COMMANDS: Readonly<Record<ShareChoice, { readonly taxRecoverable: boolean; readonly recoverablePercent: number | null }>> = {
  NONE: { taxRecoverable: false, recoverablePercent: null },
  HALF: { taxRecoverable: true, recoverablePercent: 50 },
  ALL: { taxRecoverable: true, recoverablePercent: 100 },
};

/** An open dialog: its mode and the category it acts on (none for Add). */
interface CategoryDialog {
  readonly mode: CategoryDialogMode;
  readonly code: string | null;
  readonly label: string;
  /** The category version read when the dialog opened (or refreshed by a re-read); sent with a rename. */
  readonly version: number | null;
  /** The label and examples the fields were filled from, to tell untouched fields from edited ones. */
  readonly baseLabel: string;
  readonly baseExamples: string;
}

const DIALOG_KEYS: Readonly<Record<CategoryDialogMode, { readonly title: string; readonly confirm: string; readonly done: string }>> = {
  CREATE: {
    title: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.CREATE.TITLE',
    confirm: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.CREATE.CONFIRM',
    done: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.CREATE.DONE',
  },
  RELABEL: {
    title: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.RELABEL.TITLE',
    confirm: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.RELABEL.CONFIRM',
    done: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.RELABEL.DONE',
  },
  DEACTIVATE: {
    title: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.DEACTIVATE.TITLE',
    confirm: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.DEACTIVATE.CONFIRM',
    done: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.DEACTIVATE.DONE',
  },
  REMAP: {
    title: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.REMAP.TITLE',
    confirm: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.REMAP.CONFIRM',
    done: 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.REMAP.DONE',
  },
};

/** Today as a local calendar day, `YYYY-MM-DD` (ADR-0038: never `toISOString()`). */
export function localDay(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Approval limits' **Petty-expense categories** section (CAP:550 S21,
 * SPEC-accounting-workspace §4.6, §5.5). The page owns the category read (its
 * changes also feed History); this component renders it and runs the four
 * commands, each in a native `dialog[appModalDialog]` with its consequence
 * sentence and a required "Why?".
 *
 * - Each action is hidden, not disabled, without its permission (P5), and its
 *   method refuses too (ADR-0040 §6a): Add `categoryCreate` (both codes),
 *   Rename `categoryEdit`, Turn off `categoryDeactivate`, Change account
 *   `categoryRemap`. Without any, the table is read-only with the note.
 * - A `requestId` is made when a dialog opens, reused while the same payload is
 *   resent and rotated after a confirmed success, on close, or when the payload
 *   changes (§8.2). No request carries an actor (ADR-0018).
 * - After a success the page re-reads; focus then returns to the row's action,
 *   or to the section heading when that control is gone.
 * - Codes are permanent; categories are turned off, never deleted (§4.6).
 *
 * **Tax recovery** (CAP:550 S33, §4.7, §5.5): the page's recovery read
 * (`recovery`, its own status, ADR-0064) decides alone whether the shop claims
 * tax back — never a currency, locale or country. With recovery on, the
 * section adds the registrations panel, the **Tax claimed back** column, the
 * cashier's three steps and, for `accounting:mapping-key:edit`, a **Change
 * share** action per row (hidden otherwise, P5; the handler refuses too). With
 * recovery off none of their nodes exist; a failed or undecidable read says so
 * with Try again and offers no change. Regimes and tax types are served codes,
 * shown as served (owner direction: configuration-driven, multi-national).
 */
@Component({
  selector: 'app-petty-expense-categories',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MoneyPipe, TranslatePipe, ModalDialogDirective, HelpDisclosureComponent, TaxRegistrationsPanelComponent],
  templateUrl: './petty-expense-categories.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', '../bills/bills-shared.css', './petty-expense-categories.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PettyExpenseCategoriesComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(PettyExpenseCategoriesService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly preferences = inject(AccountingPreferencesService);

  /** The page's category read: null until one answers. */
  readonly categories = input<readonly PettyExpenseCategory[] | null>(null);
  readonly status = input<RegionStatus>('PENDING');
  /** A command succeeded or found the category moved: the page re-reads categories and History. */
  readonly changed = output<void>();
  readonly retry = output<void>();
  /** The page's input-tax recovery read (S33): null until one answers. */
  readonly recovery = input<InputTaxRecovery | null>(null);
  readonly recoveryStatus = input<RegionStatus>('PENDING');
  /** Try again on the recovery read. */
  readonly recoveryRetry = output<void>();

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  readonly reasonMin = CATEGORY_REASON_MIN;
  readonly labelMax = CATEGORY_LABEL_MAX;
  readonly examplesMax = CATEGORY_EXAMPLES_MAX;
  readonly dialogKeys = DIALOG_KEYS;
  readonly toDatePipeInput = toDatePipeInput;

  // ── Gates (ADR-0040 §6a; unknown perm_bits follows canAccess) ──────────
  readonly canCreate = computed(() => canAccess(this.auth, { allPermissions: ACCOUNTING_SECTION.categoryCreate }));
  readonly canEdit = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.categoryEdit }));
  readonly canDeactivate = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.categoryDeactivate }));
  readonly canRemap = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_SECTION.categoryRemap }));
  readonly canWrite = computed(() => this.canCreate() || this.canEdit() || this.canDeactivate() || this.canRemap());
  readonly hasRowActions = computed(() => this.canEdit() || this.canDeactivate() || this.canRemap());
  /** Writes need a current read (ADR-0064: actionability gates on OK). */
  readonly actionable = computed(() => this.status() === 'OK' && this.categories() !== null);

  // ── Dialog (closed → editing → submitting → closed | editing) ─────────
  readonly dialog = signal<CategoryDialog | null>(null);
  readonly busy = signal(false);
  readonly failure = signal<CategoryFailure | null>(null);
  readonly code = signal('');
  readonly label = signal('');
  readonly examples = signal('');
  readonly accountId = signal('');
  readonly effectiveFrom = signal('');
  readonly reason = signal('');
  /** The local day the open dialog started on (ADR-0038: refreshed on every open). */
  readonly today = signal(localDay(new Date()));

  readonly accounts = signal<readonly ExpenseAccountOption[]>([]);
  readonly accountsStatus = signal<RegionStatus>('PENDING');

  readonly announcement = signal<string | null>(null);

  private requestId: string | null = null;
  private sentPayload: string | null = null;
  private writeToken = 0;
  private writeSubscription: Subscription | null = null;
  private accountsToken = 0;
  private accountsSubscription: Subscription | null = null;
  /** Where focus goes once the re-read after a success lands. */
  private pendingFocus: { readonly code: string | null; readonly mode: FocusMode } | null = null;
  /** A refusal said the category moved: the next re-read refreshes the open dialog's untouched fields. */
  private refreshOnReread = false;
  private trackedIdentity = this.identity();

  readonly chosenAccount = computed(() => this.accounts().find(option => option.glAccountId === this.accountId()) ?? null);
  readonly reasonValid = computed(() => this.reason().trim().length >= CATEGORY_REASON_MIN);
  readonly codeValid = computed(() => CATEGORY_CODE_PATTERN.test(this.code().trim()));
  readonly labelValid = computed(() => {
    const value = this.label().trim();
    return value.length > 0 && value.length <= CATEGORY_LABEL_MAX;
  });
  readonly examplesValid = computed(() => this.examples().trim().length <= CATEGORY_EXAMPLES_MAX);
  readonly accountValid = computed(() => this.accountsStatus() === 'OK' && this.chosenAccount() !== null);
  readonly dateValid = computed(() => DATE_ONLY.test(this.effectiveFrom()));
  /** The open dialog's category as last read. */
  readonly dialogCategory = computed(() => {
    const code = this.dialog()?.code;
    return code ? (this.categories()?.find(row => row.code === code) ?? null) : null;
  });
  /** A stale read blocks every write; the controls stay focusable and say why (ADR-0029 §8). */
  readonly blockedReasonId = computed(() => (this.actionable() ? null : this.status() === 'FAILED' ? 'categories-error-text' : 'categories-stale-text'));

  // ── Tax recovery (S33) ─────────────────────────────────────────────────
  readonly showTerms = this.preferences.showTerms;
  readonly shareChoices = SHARE_CHOICES;
  readonly shareReasonMin = SHARE_REASON_MIN;
  /** Whether the shop claims tax back, from the read alone; null without a read, or while a failed read stands. */
  readonly recoveryShownState = computed(() => {
    const read = this.recovery();
    return read && this.recoveryStatus() !== 'FAILED' ? recoveryState(read) : null;
  });
  /** The panel, the column, the steps and Change share exist only with recovery on (§9.5, AC 1–2). */
  readonly recoveryOn = computed(() => this.recoveryShownState() === 'ON');
  /** The read failed: no tax element, a notice with Try again (story item 1). */
  readonly recoveryFailed = computed(() => this.recoveryStatus() === 'FAILED');
  /** The read answered that recovery cannot be determined now (`enabled: null`): never read as on or off. */
  readonly recoveryUnknown = computed(() => this.recoveryShownState() === 'UNKNOWN');
  /** The served shares by category code. */
  private readonly sharesByCode = computed(() => new Map((this.recovery()?.categories ?? []).map(row => [row.code, row] as const)));
  /** The drawer receipt's evidence threshold, when the served rules name exactly one. */
  readonly evidenceThreshold = computed(() => {
    const read = this.recovery();
    return read ? drawerEvidenceThreshold(read) : null;
  });
  /** A share change needs both current reads (ADR-0064: actionability gates on OK). */
  readonly shareActionable = computed(() => this.actionable() && this.recoveryStatus() === 'OK' && this.recoveryOn());
  readonly shareBlockedReasonId = computed(() =>
    this.shareActionable() ? null : (this.blockedReasonId() ?? 'tax-recovery-stale-text'),
  );

  readonly shareDialog = signal<ShareDialog | null>(null);
  readonly shareChoice = signal<ShareChoice | null>(null);
  readonly shareReason = signal('');
  readonly shareBusy = signal(false);
  readonly shareFailure = signal<ShareFailure | null>(null);
  /** Set when a refusal closed the dialog (recovery switched off meanwhile); shown above the table. */
  readonly shareNotice = signal<string | null>(null);
  private shareRequestId: string | null = null;
  private shareSent: string | null = null;
  private shareToken = 0;
  private shareSubscription: Subscription | null = null;
  /** A refusal said the row moved: the next recovery re-read refreshes the open dialog's version. */
  private shareRefreshOnReread = false;

  /** The open dialog's category as the recovery read last served it. */
  readonly shareRow = computed(() => {
    const open = this.shareDialog();
    return open ? (this.sharesByCode().get(open.code) ?? null) : null;
  });
  readonly shareReasonValid = computed(() => this.shareReason().trim().length >= SHARE_REASON_MIN);
  readonly shareValid = computed(() => this.shareDialog() !== null && this.shareChoice() !== null && this.shareReasonValid() && this.shareRow() !== null);

  readonly dialogValid = computed(() => {
    const open = this.dialog();
    if (!open || !this.reasonValid()) return false;
    switch (open.mode) {
      case 'CREATE':
        return this.codeValid() && this.labelValid() && this.examplesValid() && this.accountValid();
      case 'RELABEL':
        return this.labelValid() && this.examplesValid();
      case 'DEACTIVATE':
        // Only an active category can be turned off; a re-read that shows it off blocks the confirm.
        return this.dialogCategory()?.status === 'ACTIVE';
      case 'REMAP':
        return this.accountValid() && this.dateValid();
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.writeToken++;
      this.accountsToken++;
      this.shareToken++;
      this.writeSubscription?.unsubscribe();
      this.accountsSubscription?.unsubscribe();
      this.shareSubscription?.unsubscribe();
    });
    // ADR-0063 §7: another tenant or person drops any dialog and write in flight.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.writeToken++;
        this.writeSubscription?.unsubscribe();
        this.shareToken++;
        this.shareSubscription?.unsubscribe();
        this.pendingFocus = null;
        this.announcement.set(null);
        this.shareNotice.set(null);
        this.resetDialog();
        this.resetShare();
      });
    });
    // After a success, the re-read that answers it settles focus (ADR-0029 §8.7, ADR-0063 §4).
    effect(() => {
      const categories = this.categories();
      const status = this.status();
      const recoveryStatus = this.recoveryStatus();
      if (!this.pendingFocus || status === 'PENDING' || categories === null) return;
      // Change share's control comes with the recovery read: wait for its re-read too.
      if (this.pendingFocus.mode === 'TAX_SHARE' && recoveryStatus === 'PENDING') return;
      const target = this.pendingFocus;
      this.pendingFocus = null;
      afterNextRender({ write: () => this.settleFocus(target) }, { injector: this.injector });
    });
    // After a refusal that re-reads, the open dialog takes the re-read row's version and its untouched fields (ADR-0063 §1–2).
    effect(() => {
      const categories = this.categories();
      if (!this.refreshOnReread || this.status() !== 'OK' || categories === null) return;
      untracked(() => {
        this.refreshOnReread = false;
        const open = this.dialog();
        const row = open?.code ? categories.find(category => category.code === open.code) : null;
        if (!open || !row) return;
        const examples = row.examples ?? '';
        if (this.label() === open.baseLabel) this.label.set(row.label);
        if (this.examples() === open.baseExamples) this.examples.set(examples);
        this.dialog.set({ ...open, label: row.label, version: row.version, baseLabel: row.label, baseExamples: examples });
      });
    });
    // After a refusal that re-reads, the open Change share takes the re-read setting's version (ADR-0063 §1–2).
    effect(() => {
      const shares = this.sharesByCode();
      if (!this.shareRefreshOnReread || this.recoveryStatus() !== 'OK') return;
      untracked(() => {
        this.shareRefreshOnReread = false;
        const open = this.shareDialog();
        const row = open ? shares.get(open.code) : undefined;
        if (open && row) this.shareDialog.set({ ...open, label: row.label, version: row.version });
      });
    });
  }

  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  private settleFocus(target: { readonly code: string | null; readonly mode: FocusMode }): void {
    // A Change share closed by a refusal has no row action left to return to: the heading is.
    const selector =
      target.code === null
        ? target.mode === 'CREATE'
          ? '[data-focus-key="CREATE"]'
          : null
        : `[data-focus-key="${CSS.escape(`${target.code}|${target.mode}`)}"]`;
    const control = selector ? this.host.nativeElement.querySelector<HTMLElement>(selector) : null;
    // A control that is gone, disabled or blocked by a stale read is no place for focus: the heading is.
    const usable = control && !(control as HTMLButtonElement).disabled && control.getAttribute('aria-disabled') !== 'true';
    (usable ? control : this.heading()?.nativeElement)?.focus();
  }

  /** The key the open dialog would send next, for tests and the PR evidence; never shown. */
  currentRequestId(): string | null {
    return this.requestId;
  }

  focusHeading(): void {
    const element = this.heading()?.nativeElement;
    if (!element) return;
    if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'start' });
    element.focus();
  }

  accountText(account: PettyExpenseAccount): string {
    return [account.accountName, account.accountCode].filter(Boolean).join(' ');
  }

  // ── Opening ───────────────────────────────────────────────────────────
  private allowed(mode: CategoryDialogMode): boolean {
    switch (mode) {
      case 'CREATE':
        return this.canCreate();
      case 'RELABEL':
        return this.canEdit();
      case 'DEACTIVATE':
        return this.canDeactivate();
      case 'REMAP':
        return this.canRemap();
    }
  }

  /** Opens a dialog, re-checked here: permission, a current read, the row's state. */
  open(mode: CategoryDialogMode, category: PettyExpenseCategory | null = null): void {
    if (!this.allowed(mode) || !this.actionable() || this.dialog() || this.shareDialog()) return;
    if (mode !== 'CREATE' && !category) return;
    if (mode === 'DEACTIVATE' && category?.status !== 'ACTIVE') return;
    this.resetDialog();
    this.today.set(localDay(new Date()));
    this.label.set(mode === 'RELABEL' ? (category?.label ?? '') : '');
    this.examples.set(mode === 'RELABEL' ? (category?.examples ?? '') : '');
    this.effectiveFrom.set(this.today());
    this.requestId = uuidV7();
    this.dialog.set({
      mode,
      code: category?.code ?? null,
      label: category?.label ?? '',
      version: category?.version ?? null,
      baseLabel: this.label(),
      baseExamples: this.examples(),
    });
    if (mode === 'CREATE' || mode === 'REMAP') this.loadAccounts();
  }

  /** Closes the dialog; the key rotates and focus returns to the trigger (the directive). */
  close(): void {
    if (this.busy()) return;
    this.resetDialog();
  }

  private resetDialog(): void {
    this.accountsToken++;
    this.accountsSubscription?.unsubscribe();
    this.dialog.set(null);
    this.busy.set(false);
    this.failure.set(null);
    this.code.set('');
    this.label.set('');
    this.examples.set('');
    this.accountId.set('');
    this.effectiveFrom.set('');
    this.reason.set('');
    this.accounts.set([]);
    this.accountsStatus.set('PENDING');
    this.requestId = null;
    this.sentPayload = null;
    this.refreshOnReread = false;
  }

  loadAccounts(): void {
    const token = ++this.accountsToken;
    this.accountsSubscription?.unsubscribe();
    this.accountsStatus.set('PENDING');
    this.accountsSubscription = this.service.listExpenseAccounts().subscribe({
      next: options => {
        if (token !== this.accountsToken) return;
        this.accounts.set(options);
        this.accountsStatus.set('OK');
      },
      error: () => {
        if (token !== this.accountsToken) return;
        this.accounts.set([]);
        this.accountsStatus.set('FAILED');
      },
    });
  }

  // ── Submitting ────────────────────────────────────────────────────────
  /** Runs the open dialog's command, re-checked here: permission, a current read, valid fields, nothing in flight. */
  submit(): void {
    const open = this.dialog();
    if (!open || this.busy() || !this.allowed(open.mode) || !this.actionable() || !this.dialogValid()) return;
    const category = open.code === null ? null : (this.categories()?.find(row => row.code === open.code) ?? null);
    if (open.mode !== 'CREATE' && !category) return;
    if (open.mode === 'DEACTIVATE' && category?.status !== 'ACTIVE') return;
    const justification = this.reason().trim();
    const payload = this.payload(open, justification);
    const body = JSON.stringify(payload);
    if (this.sentPayload !== null && this.sentPayload !== body) this.requestId = uuidV7();
    const requestId = this.requestId ?? uuidV7();
    this.requestId = requestId;
    this.sentPayload = body;
    const token = ++this.writeToken;
    this.busy.set(true);
    this.failure.set(null);
    this.writeSubscription = this.command(open, payload, requestId).subscribe({
      next: () => {
        if (token !== this.writeToken) return;
        this.pendingFocus = { code: open.code, mode: open.mode };
        this.announcement.set(DIALOG_KEYS[open.mode].done);
        this.busy.set(false);
        this.resetDialog();
        this.changed.emit();
      },
      error: (error: unknown) => {
        if (token !== this.writeToken) return;
        this.busy.set(false);
        const failure = classifyCategoryError(error, this.permissionFor(open.mode));
        if (failure.rotate) {
          this.requestId = uuidV7();
          this.sentPayload = null;
        }
        this.failure.set(failure);
        if (failure.reread) {
          this.refreshOnReread = true;
          this.changed.emit();
        }
      },
    });
  }

  private payload(open: CategoryDialog, justification: string): Record<string, unknown> {
    const examples = this.examples().trim() || null;
    switch (open.mode) {
      case 'CREATE':
        return { code: this.code().trim(), label: this.label().trim(), examples, glAccountId: this.accountId(), justification };
      case 'RELABEL':
        return { label: this.label().trim(), examples, version: open.version, justification };
      case 'DEACTIVATE':
        return { justification };
      case 'REMAP':
        return { glAccountId: this.accountId(), effectiveFrom: this.effectiveFrom(), justification };
    }
  }

  private command(open: CategoryDialog, payload: Record<string, unknown>, requestId: string): Observable<unknown> {
    const code = open.code ?? '';
    const justification = payload['justification'] as string;
    switch (open.mode) {
      case 'CREATE':
        return this.service.create({
          code: payload['code'] as string,
          label: payload['label'] as string,
          examples: payload['examples'] as string | null,
          glAccountId: payload['glAccountId'] as string,
          justification,
          requestId,
        });
      case 'RELABEL':
        return this.service.relabel(code, {
          label: payload['label'] as string,
          examples: payload['examples'] as string | null,
          version: payload['version'] as number | null,
          justification,
          requestId,
        });
      case 'DEACTIVATE':
        return this.service.deactivate(code, { justification, requestId });
      case 'REMAP':
        return this.service.remap(code, {
          glAccountId: payload['glAccountId'] as string,
          effectiveFrom: payload['effectiveFrom'] as string,
          justification,
          requestId,
        });
    }
  }

  private permissionFor(mode: CategoryDialogMode): string {
    switch (mode) {
      case 'CREATE':
        return ACCOUNTING_SECTION.categoryCreate.join(', ');
      case 'RELABEL':
        return ACCOUNTING_SECTION.categoryEdit[0];
      case 'DEACTIVATE':
        return ACCOUNTING_SECTION.categoryDeactivate[0];
      case 'REMAP':
        return ACCOUNTING_SECTION.categoryRemap[0];
    }
  }

  // ── Change share (S33) ────────────────────────────────────────────────
  /** The column's copy for a category row. */
  shareCell(code: string): ShareCopy {
    return shareCopy(this.sharesByCode().get(code));
  }

  /**
   * Opens Change share, re-checked here (ADR-0040 §6a): `accounting:mapping-key:edit`, recovery on,
   * both reads current, a row the recovery read knows. The `requestId` is made now (§8.2).
   */
  openShare(category: PettyExpenseCategory): void {
    if (!this.canEdit() || !this.shareActionable() || this.dialog() || this.shareDialog()) return;
    const row = this.sharesByCode().get(category.code);
    if (!row) return;
    this.resetShare();
    this.shareNotice.set(null);
    this.shareChoice.set(choiceOf(row));
    this.shareRequestId = uuidV7();
    this.shareDialog.set({ code: row.code, label: category.label, version: row.version });
  }

  closeShare(): void {
    if (this.shareBusy()) return;
    this.resetShare();
  }

  private resetShare(): void {
    this.shareDialog.set(null);
    this.shareChoice.set(null);
    this.shareReason.set('');
    this.shareBusy.set(false);
    this.shareFailure.set(null);
    this.shareRequestId = null;
    this.shareSent = null;
    this.shareRefreshOnReread = false;
  }

  /** The key the open Change share would send next, for tests; never shown. */
  currentShareRequestId(): string | null {
    return this.shareRequestId;
  }

  chooseShare(choice: ShareChoice): void {
    if (this.shareBusy()) return;
    this.shareChoice.set(choice);
  }

  /**
   * Saves the share, re-checked here: permission, recovery on, current reads, a choice and a
   * reason of at least 10 characters, nothing in flight. The `requestId` is reused while the
   * identical payload is resent (a retry, a double click, a timeout) and rotated when it changes.
   */
  submitShare(): void {
    const open = this.shareDialog();
    const choice = this.shareChoice();
    if (!open || !choice || this.shareBusy() || !this.canEdit() || !this.shareActionable() || !this.shareValid()) return;
    const command = SHARE_COMMANDS[choice];
    const justification = this.shareReason().trim();
    const body = JSON.stringify([open.code, command.taxRecoverable, command.recoverablePercent, open.version, justification]);
    if (this.shareSent !== null && this.shareSent !== body) this.shareRequestId = uuidV7();
    const requestId = this.shareRequestId ?? uuidV7();
    this.shareRequestId = requestId;
    this.shareSent = body;
    const sent: TaxShareCommand = { ...command, version: open.version, justification, requestId };
    const token = ++this.shareToken;
    this.shareBusy.set(true);
    this.shareFailure.set(null);
    this.shareSubscription = this.service.setTaxShare(open.code, sent).subscribe({
      next: () => {
        if (token !== this.shareToken) return;
        this.pendingFocus = { code: open.code, mode: 'TAX_SHARE' };
        this.announcement.set('ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.DONE');
        this.shareBusy.set(false);
        this.resetShare();
        this.changed.emit();
      },
      error: (error: unknown) => {
        if (token !== this.shareToken) return;
        this.shareBusy.set(false);
        const failure = classifyShareError(error, ACCOUNTING_SECTION.categoryEdit[0]);
        if (failure.rotate) {
          this.shareRequestId = uuidV7();
          this.shareSent = null;
        }
        if (failure.followUp === 'CLOSE_AND_REREAD') {
          // Recovery was switched off meanwhile: nothing changed; the section re-reads and says why.
          this.resetShare();
          this.shareNotice.set(failure.key);
          this.announcement.set(failure.key);
          this.pendingFocus = { code: null, mode: 'TAX_SHARE' };
          this.changed.emit();
          return;
        }
        this.shareFailure.set(failure);
        if (failure.followUp === 'REREAD') {
          this.shareRefreshOnReread = true;
          this.changed.emit();
        }
      },
    });
  }

  shareFieldMarked(field: ShareField): boolean {
    return !!this.shareFailure()?.fields.includes(field);
  }

  /** The consequence sentence for the chosen share (P4), before Save. */
  readonly shareConsequenceKey = computed(() => {
    const choice = this.shareChoice();
    return choice ? `ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.CONSEQUENCE.${choice}` : 'ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.CONSEQUENCE.PENDING';
  });

  fieldMarked(field: CategoryField): boolean {
    return !!this.failure()?.fields.includes(field);
  }

  /** The code is typed and not 1–40 capital letters, digits or underscores. */
  readonly codeMalformed = computed(() => this.code().trim() !== '' && !this.codeValid());

  /** `aria-describedby` for a dialog field: its hint, plus the error when the refusal names it. */
  describedBy(field: CategoryField, hintId: string | null): string | null {
    const ids = [
      hintId,
      field === 'code' && this.codeMalformed() ? 'category-code-error' : null,
      this.fieldMarked(field) ? 'category-dialog-error' : null,
    ].filter(Boolean);
    return ids.length ? ids.join(' ') : null;
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }
}
