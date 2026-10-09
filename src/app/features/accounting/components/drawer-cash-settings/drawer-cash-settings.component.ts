import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../shared/money.pipe';
import { ConfigurableDrawerType, DrawerMovementType, DrawerPolicy, DrawerTypePolicy } from '../../models/drawer-policy.models';
import {
  AmountProblem,
  DRAWER_TYPE_KEY,
  DrawerDraft,
  DrawerField,
  DrawerTypeDraft,
  limitProblem,
  parseAmount,
  toleranceProblem,
} from '../../utils/drawer-draft';

const TYPE_KEYS: Readonly<Record<DrawerMovementType, string>> = {
  PETTY_EXPENSE: 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.TYPE.PETTY_EXPENSE',
  VENDOR_COD: 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.TYPE.VENDOR_COD',
  BANK_DROP: 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.TYPE.BANK_DROP',
  FLOAT_CHANGE: 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.TYPE.FLOAT_CHANGE',
  UNKNOWN: 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.TYPE.UNKNOWN',
};

const PROBLEM_KEYS: Readonly<Record<Exclude<AmountProblem, null>, string>> = {
  REQUIRED: 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.ERROR.REQUIRED',
  AMOUNT: 'ACCOUNTING.APPROVAL_LIMITS.DRAWER.ERROR.AMOUNT',
};

/** A row as the template renders it. */
interface DrawerRowView {
  readonly row: DrawerTypePolicy;
  readonly slug: string;
  /** The draft key of an editable configurable row; null for a read-only row. */
  readonly field: 'pettyExpense' | 'vendorCod' | null;
}

/**
 * Approval limits' **Drawer cash** section (CAP:550 S21, SPEC-accounting-workspace
 * §4.6, §5.5, §5.6). The page owns the served policy and the draft (both sent by
 * its Save card through pos-order); this component renders the served types in
 * served order and edits the draft.
 *
 * - A configurable type (petty expenses, vendor cash on delivery) has an
 *   **Allowed** `<input type="checkbox" role="switch">` named by its row title
 *   and the visible "Allowed" (Label in Name), and its cashier amount, disabled
 *   with its value kept while off and required while on.
 * - Bank drops and float changes are read-only rows with a text badge; an
 *   unknown served type is a read-only "Unknown" row (§8.2).
 * - "What this means at the register" quotes the typed values: no arithmetic (P7).
 */
@Component({
  selector: 'app-drawer-cash-settings',
  standalone: true,
  imports: [MoneyPipe, TranslatePipe],
  templateUrl: './drawer-cash-settings.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', '../bills/bills-shared.css', './drawer-cash-settings.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DrawerCashSettingsComponent {
  readonly policy = input.required<DrawerPolicy>();
  readonly draft = model.required<DrawerDraft>();
  /** Fields the last refused save named; each links the save error by `aria-describedby`. */
  readonly serverFields = input<readonly DrawerField[]>([]);
  /** The id of the Save card's drawer error, for `aria-describedby`. */
  readonly errorId = input('limits-drawer-save-error');
  /** True while a save is in flight: the fields stay as typed and cannot change. */
  readonly locked = input(false);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  readonly typeKeys = TYPE_KEYS;
  readonly problemKeys = PROBLEM_KEYS;

  readonly rows = computed<readonly DrawerRowView[]>(() =>
    this.policy().types.map((row, index) => ({
      row,
      slug: `${row.type.toLowerCase().replace(/_/g, '-')}-${index}`,
      field: row.editable && (row.type === 'PETTY_EXPENSE' || row.type === 'VENDOR_COD') ? DRAWER_TYPE_KEY[row.type] : null,
    })),
  );

  readonly toleranceProblem = computed(() => toleranceProblem(this.draft().toleranceText));
  readonly tolerance = computed(() => parseAmount(this.draft().toleranceText));

  /** The configurable types served editable, in served order, for "What this means". */
  readonly meansTypes = computed(() =>
    this.rows()
      .filter((view): view is DrawerRowView & { field: 'pettyExpense' | 'vendorCod' } => view.field !== null)
      .map(view => ({ type: view.row.type as ConfigurableDrawerType, field: view.field })),
  );

  typeDraft(field: 'pettyExpense' | 'vendorCod'): DrawerTypeDraft {
    return this.draft()[field];
  }

  limitProblem(field: 'pettyExpense' | 'vendorCod'): AmountProblem {
    return limitProblem(this.typeDraft(field));
  }

  limit(field: 'pettyExpense' | 'vendorCod'): number | null {
    return parseAmount(this.typeDraft(field).limitText);
  }

  serverMarked(field: DrawerField): boolean {
    return this.serverFields().includes(field);
  }

  limitMarked(field: 'pettyExpense' | 'vendorCod'): boolean {
    return this.serverMarked(`${field}.cashierLimit`);
  }

  limitDescribedBy(view: DrawerRowView, field: 'pettyExpense' | 'vendorCod'): string {
    return (
      `drawer-${view.slug}-hint` +
      (this.limitProblem(field) ? ` drawer-${view.slug}-error` : '') +
      (this.limitMarked(field) ? ` ${this.errorId()}` : '')
    );
  }

  toleranceDescribedBy(): string {
    return (
      'drawer-tolerance-hint' +
      (this.toleranceProblem() ? ' drawer-tolerance-error' : '') +
      (this.serverMarked('overShortTolerance') ? ` ${this.errorId()}` : '')
    );
  }

  setAllowed(field: 'pettyExpense' | 'vendorCod', allowed: boolean): void {
    if (this.locked()) return;
    this.draft.update(draft => ({ ...draft, [field]: { ...draft[field], allowed } }));
  }

  setLimit(field: 'pettyExpense' | 'vendorCod', limitText: string): void {
    if (this.locked() || !this.draft()[field].allowed) return;
    this.draft.update(draft => ({ ...draft, [field]: { ...draft[field], limitText } }));
  }

  setTolerance(toleranceText: string): void {
    if (this.locked()) return;
    this.draft.update(draft => ({ ...draft, toleranceText }));
  }

  /** In-page link target. */
  focusHeading(): void {
    const element = this.heading()?.nativeElement;
    if (!element) return;
    if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'start' });
    element.focus();
  }

  text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
