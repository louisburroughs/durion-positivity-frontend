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
import { RegionStatus } from '../../models/accounting-home.models';
import {
  CATEGORY_CODE_PATTERN,
  CATEGORY_EXAMPLES_MAX,
  CATEGORY_LABEL_MAX,
  CATEGORY_REASON_MIN,
  ExpenseAccountOption,
  PettyExpenseAccount,
  PettyExpenseCategory,
} from '../../models/petty-expense-categories.models';
import { PettyExpenseCategoriesService } from '../../services/petty-expense-categories.service';
import { toDatePipeInput } from '../../utils/date-only.util';
import { uuidV7 } from '../../utils/uuid-v7.util';
import { CategoryDialogMode, CategoryFailure, CategoryField, classifyCategoryError } from './category-errors';

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
 * S33 (#470) adds the recovery columns and the registration panel to this
 * section; the table's columns are the place they join.
 */
@Component({
  selector: 'app-petty-expense-categories',
  standalone: true,
  imports: [DatePipe, TranslatePipe, ModalDialogDirective],
  templateUrl: './petty-expense-categories.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', '../bills/bills-shared.css', './petty-expense-categories.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PettyExpenseCategoriesComponent {
  private readonly auth = inject(AuthService);
  private readonly service = inject(PettyExpenseCategoriesService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The page's category read: null until one answers. */
  readonly categories = input<readonly PettyExpenseCategory[] | null>(null);
  readonly status = input<RegionStatus>('PENDING');
  /** A command succeeded or found the category moved: the page re-reads categories and History. */
  readonly changed = output<void>();
  readonly retry = output<void>();

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
  private pendingFocus: { readonly code: string | null; readonly mode: CategoryDialogMode } | null = null;
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
      this.writeSubscription?.unsubscribe();
      this.accountsSubscription?.unsubscribe();
    });
    // ADR-0063 §7: another tenant or person drops any dialog and write in flight.
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.writeToken++;
        this.writeSubscription?.unsubscribe();
        this.pendingFocus = null;
        this.announcement.set(null);
        this.resetDialog();
      });
    });
    // After a success, the re-read that answers it settles focus (ADR-0029 §8.7, ADR-0063 §4).
    effect(() => {
      const categories = this.categories();
      const status = this.status();
      if (!this.pendingFocus || status === 'PENDING' || categories === null) return;
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
  }

  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  private settleFocus(target: { readonly code: string | null; readonly mode: CategoryDialogMode }): void {
    const selector = target.code === null ? '[data-focus-key="CREATE"]' : `[data-focus-key="${CSS.escape(`${target.code}|${target.mode}`)}"]`;
    const control = this.host.nativeElement.querySelector<HTMLElement>(selector);
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
    if (!this.allowed(mode) || !this.actionable() || this.dialog()) return;
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
