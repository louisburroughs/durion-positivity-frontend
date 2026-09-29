import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  AdjustmentInput,
  AdjustmentType,
  BANK_REC_JUSTIFICATION_MIN,
  BankAccount,
  OPENING_DIFFERENCE_FLAG,
  ReconciliationMatch,
  ReconciliationReview,
} from '../../models/bank-reconciliation.models';
import { toDatePipeInput } from '../../utils/date-only.util';
import { parseAmountInput } from '../../utils/file-base64.util';

/** What an `OTHER` adjustment is linked to; it needs exactly one (§3.5). */
export type AdjustmentLink = 'BANK' | 'RESIDUAL' | 'BRIDGE';

/** How the page opened the dialog: from a bank row, a match's residual, or the gap bridge. */
export interface AdjustmentPreset {
  readonly type?: AdjustmentType;
  readonly link?: AdjustmentLink;
  readonly bankTransactionId?: string;
  readonly settlesMatchId?: string;
}

/**
 * The adjustment dialog of the reconciliation workspace (SPEC-manual-bank-
 * reconciliation §3.5, §4.2, §4.6, §4.7).
 *
 * Types come from `GET /adjustment-types`. `OTHER` needs a justification of
 * at least 10 characters and exactly one link: a bank transaction (its amount
 * pre-filled from the row, which the server requires it to equal), a residual
 * settlement on an ACCEPTED match whose served `toleranceUsed` is not zero, or
 * the gap bridge when the review flags OPENING_DIFFERENCE on an acknowledged
 * statement. For the last two the dialog shows the served `residual` /
 * `openingDifference` and sends no amount: the server computes it.
 * `TRANSFER` needs a counter bank account other than the reconciled one. The
 * dialog never compares an amount with the `OTHER` threshold: a 403
 * RECONCILIATION_ADJUSTMENT_APPROVAL_REQUIRED from the server says so.
 */
@Component({
  selector: 'app-reconciliation-adjustment-dialog',
  standalone: true,
  imports: [DatePipe, MoneyPipe, ReactiveFormsModule, TranslatePipe, ModalDialogDirective],
  templateUrl: './reconciliation-adjustment-dialog.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './reconciliation-adjustment-dialog.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationAdjustmentDialogComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly review = input.required<ReconciliationReview>();
  readonly types = input.required<readonly AdjustmentType[]>();
  readonly bankAccounts = input<readonly BankAccount[]>([]);
  readonly preset = input<AdjustmentPreset | null>(null);
  /** `overrideJustification` is offered only to holders of `accounting:period:override`. */
  readonly canOverride = input(false);
  /** The date the page proposes (D7): the explaining date, or the first day of the next OPEN period. */
  readonly proposedDate = input<string | null>(null);
  readonly busy = input(false);
  readonly errorKey = input<string | null>(null);
  /** Whether the adjustment types and the bank accounts could be read; a failure is not an empty list. */
  readonly typesStatus = input<'idle' | 'loading' | 'OK' | 'ERROR'>('OK');
  readonly accountsStatus = input<'idle' | 'loading' | 'OK' | 'ERROR'>('OK');

  readonly submitted = output<AdjustmentInput>();
  readonly cancelled = output<void>();
  readonly retryTypes = output<void>();
  readonly retryAccounts = output<void>();

  readonly justificationMin = BANK_REC_JUSTIFICATION_MIN;

  readonly form = new FormGroup({
    type: new FormControl<AdjustmentType | ''>('', { nonNullable: true }),
    link: new FormControl<AdjustmentLink | ''>('', { nonNullable: true }),
    bankTransactionId: new FormControl('', { nonNullable: true }),
    settlesMatchId: new FormControl('', { nonNullable: true }),
    counterGlAccountId: new FormControl('', { nonNullable: true }),
    amount: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    justification: new FormControl('', { nonNullable: true }),
    transactionDate: new FormControl('', { nonNullable: true }),
    overrideJustification: new FormControl('', { nonNullable: true }),
  });

  /** The form value as a signal, so the gates below recompute on every edit. */
  private readonly value = signal(this.form.getRawValue());

  readonly type = computed(() => this.value().type);
  readonly link = computed(() => this.value().link);

  /** Matches whose residual can be settled: ACCEPTED, served tolerance not zero. */
  readonly residualMatches = computed(() =>
    this.review().matches.filter(match => match.state === 'ACCEPTED' && match.toleranceUsed !== null && match.toleranceUsed !== 0),
  );

  /** The bridge is offered on an acknowledged statement whose review flags OPENING_DIFFERENCE. */
  readonly bridgeOffered = computed(() => {
    const review = this.review();
    return (
      !!review.header.gapAcknowledgement &&
      review.diagnostics.flags.includes(OPENING_DIFFERENCE_FLAG) &&
      !review.diagnostics.bridgeAdjustmentId
    );
  });

  /** Bank transactions an adjustment can link, late arrivals first. */
  readonly bankRows = computed(() => {
    const review = this.review();
    const seen = new Set<string>();
    return [...review.lateArrivals, ...review.unexplainedBank, ...review.possibleDuplicates].filter(row => {
      if (seen.has(row.bankTransactionId)) return false;
      seen.add(row.bankTransactionId);
      return true;
    });
  });

  /** TRANSFER counters: the other bank accounts, never the reconciled one (D9). */
  readonly counterAccounts = computed(() =>
    this.bankAccounts().filter(account => account.glAccountId !== this.review().header.glAccountId),
  );

  readonly chosenResidual = computed<ReconciliationMatch | null>(
    () => this.residualMatches().find(match => match.matchId === this.value().settlesMatchId) ?? null,
  );

  /** Residual settlements and gap bridges send no amount: the server posts the served figure (§3.5). */
  readonly serverAmount = computed(() => this.type() === 'OTHER' && (this.link() === 'RESIDUAL' || this.link() === 'BRIDGE'));

  readonly canSubmit = computed(() => {
    const value = this.value();
    if (!value.type) return false;
    if (!this.serverAmount()) {
      const amount = parseAmountInput(value.amount);
      if (amount === null || amount === 0) return false;
    }
    switch (value.type) {
      case 'OTHER':
        if (value.justification.trim().length < BANK_REC_JUSTIFICATION_MIN) return false;
        switch (value.link) {
          case 'BANK':
            return !!value.bankTransactionId;
          case 'RESIDUAL':
            return !!value.settlesMatchId;
          case 'BRIDGE':
            return this.bridgeOffered();
          default:
            return false;
        }
      case 'TRANSFER':
        return !!value.counterGlAccountId;
      default:
        return true;
    }
  });

  ngOnInit(): void {
    const preset = this.preset();
    this.form.patchValue({
      type: preset?.type ?? '',
      link: preset?.link ?? '',
      bankTransactionId: preset?.bankTransactionId ?? '',
      settlesMatchId: preset?.settlesMatchId ?? '',
      transactionDate: this.proposedDate() ?? '',
    });
    if (preset?.bankTransactionId) this.prefillFromBankRow(preset.bankTransactionId);
    this.value.set(this.form.getRawValue());

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.value.set(this.form.getRawValue()));
    this.form.controls.bankTransactionId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(id => this.prefillFromBankRow(id));
  }

  dateOnly(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  submit(): void {
    if (!this.canSubmit() || this.busy()) return;
    const value = this.form.getRawValue();
    const type = value.type as AdjustmentType;
    const other = type === 'OTHER';
    const link = other ? value.link : '';
    this.submitted.emit({
      type,
      amount: this.serverAmount() ? null : parseAmountInput(value.amount),
      description: value.description.trim() || null,
      justification: value.justification.trim() || null,
      transactionDate: value.transactionDate || null,
      overrideJustification: this.canOverride() ? value.overrideJustification.trim() || null : null,
      bankTransactionId: (other ? link === 'BANK' : type !== 'TRANSFER') ? value.bankTransactionId || null : null,
      settlesMatchId: link === 'RESIDUAL' ? value.settlesMatchId || null : null,
      bridgesStatementId: link === 'BRIDGE' ? this.review().header.statementId : null,
      counterGlAccountId: type === 'TRANSFER' ? value.counterGlAccountId || null : null,
    });
  }

  /** A linked adjustment must equal the bank transaction exactly: its amount is taken from the row. */
  private prefillFromBankRow(bankTransactionId: string): void {
    const row = this.bankRows().find(candidate => candidate.bankTransactionId === bankTransactionId);
    if (row?.signedAmount !== null && row?.signedAmount !== undefined) {
      this.form.controls.amount.setValue(String(row.signedAmount), { emitEvent: false });
      this.value.set(this.form.getRawValue());
    }
  }
}
