import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  BANK_REC_JUSTIFICATION_MIN,
  BankStatement,
  StatementSupersession,
} from '../../models/bank-reconciliation.models';
import { BankReconciliationService } from '../../services/bank-reconciliation.service';
import { toDatePipeInput } from '../../utils/date-only.util';

/**
 * What the control holds: `off`, `incomplete` (on, but no statement chosen or
 * the justification is short), or a complete supersession to send.
 */
export type SupersedeChoice =
  | { readonly state: 'off' }
  | { readonly state: 'incomplete' }
  | { readonly state: 'ready'; readonly supersession: StatementSupersession };

type ReadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * "Replace a committed statement" (SPEC-manual-bank-reconciliation §4.9 path
 * 3), shared by the import wizard's upload step and the manual-statement form.
 *
 * Lists the account's COMMITTED statements and sets `supersedesStatementId`
 * with a justification of at least 10 characters. When the chosen statement's
 * reconciliation links show a FINALIZED reconciliation, it warns that the
 * approval will be invalidated. It decides no eligibility: the server answers
 * 422 STATEMENT_SUPERSESSION_NOT_ELIGIBLE, and the host calls `reload()`.
 */
@Component({
  selector: 'app-statement-supersede',
  standalone: true,
  imports: [DatePipe, MoneyPipe, ReactiveFormsModule, TranslatePipe],
  templateUrl: './statement-supersede.component.html',
  styleUrl: './statement-supersede.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatementSupersedeComponent {
  private readonly service = inject(BankReconciliationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly glAccountId = input.required<string>();
  readonly disabled = input(false);
  readonly choice = output<SupersedeChoice>();

  readonly justificationMin = BANK_REC_JUSTIFICATION_MIN;

  readonly enabled = new FormControl(false, { nonNullable: true });
  readonly statementId = new FormControl('', { nonNullable: true });
  readonly justification = new FormControl('', { nonNullable: true });
  readonly form = new FormGroup({ enabled: this.enabled, statementId: this.statementId, justification: this.justification });

  readonly on = signal(false);
  readonly listState = signal<ReadState>('idle');
  readonly statements = signal<readonly BankStatement[]>([]);
  readonly chosenState = signal<ReadState>('idle');
  readonly chosen = signal<BankStatement | null>(null);
  readonly justificationLength = signal(0);

  /** The chosen statement's approval will be invalidated (a FINALIZED reconciliation covers it). */
  readonly invalidatesApproval = computed(
    () => this.chosen()?.reconciliations.some(link => link.status === 'FINALIZED') ?? false,
  );

  private listSub: Subscription | null = null;
  private chosenSub: Subscription | null = null;

  constructor() {
    this.enabled.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(on => {
      this.on.set(on);
      if (on) this.reload();
      this.emit();
    });
    this.statementId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(id => {
      this.readChosen(id);
      this.emit();
    });
    this.justification.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      this.justificationLength.set(value.trim().length);
      this.emit();
    });
    // A different account invalidates everything the control read.
    effect(() => {
      this.glAccountId();
      untracked(() => {
        if (this.on()) this.reload();
      });
    });
    this.destroyRef.onDestroy(() => {
      this.listSub?.unsubscribe();
      this.chosenSub?.unsubscribe();
    });
  }

  /** Re-reads the COMMITTED statements, e.g. after the server refused the chosen one. */
  reload(): void {
    this.listSub?.unsubscribe();
    // The chosen statement's read belongs to the previous list: it must not land after this.
    this.chosenSub?.unsubscribe();
    this.chosenSub = null;
    this.listState.set('loading');
    this.statementId.setValue('', { emitEvent: false });
    this.chosen.set(null);
    this.chosenState.set('idle');
    this.listSub = this.service.listStatements(this.glAccountId()).subscribe({
      next: statements => {
        this.statements.set(statements.filter(statement => statement.status === 'COMMITTED'));
        this.listState.set('ready');
        this.emit();
      },
      error: () => this.listState.set('error'),
    });
    this.emit();
  }

  dateOnly(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  private readChosen(statementId: string): void {
    this.chosenSub?.unsubscribe();
    this.chosen.set(null);
    if (!statementId) {
      this.chosenState.set('idle');
      return;
    }
    this.chosenState.set('loading');
    this.chosenSub = this.service.getStatement(statementId).subscribe({
      next: statement => {
        this.chosen.set(statement);
        this.chosenState.set('ready');
      },
      error: () => this.chosenState.set('error'),
    });
  }

  private emit(): void {
    if (!this.enabled.value) {
      this.choice.emit({ state: 'off' });
      return;
    }
    const statementId = this.statementId.value;
    const justification = this.justification.value.trim();
    if (!statementId || justification.length < BANK_REC_JUSTIFICATION_MIN) {
      this.choice.emit({ state: 'incomplete' });
      return;
    }
    this.choice.emit({
      state: 'ready',
      supersession: { supersedesStatementId: statementId, supersessionJustification: justification },
    });
  }
}
