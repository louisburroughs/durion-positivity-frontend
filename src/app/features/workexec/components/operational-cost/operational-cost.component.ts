import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, Input, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { WorkexecService } from '../../services/workexec.service';

@Component({
  selector: 'app-operational-cost',
  standalone: true,
  imports: [CurrencyPipe, TranslatePipe],
  templateUrl: './operational-cost.component.html',
  styleUrl: './operational-cost.component.css',
})
export class OperationalCostComponent {
  private readonly workexecService = inject(WorkexecService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) workorderId = '';
  @Input() debitTotalInput: number | null = null;
  @Input() creditTotalInput: number | null = null;
  @Input() netTotalInput: number | null = null;

  readonly debitTotal = signal(0);
  readonly creditTotal = signal(0);
  readonly netTotal = computed(() => this.debitTotal() - this.creditTotal());

  ngOnInit(): void {
    if (this.debitTotalInput !== null && this.creditTotalInput !== null) {
      this.debitTotal.set(this.debitTotalInput);
      this.creditTotal.set(this.creditTotalInput);
      return;
    }

    if (!this.workorderId) {
      return;
    }

    this.workexecService
      .getWorkorderDetail(this.workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: detail => {
          const operational = detail.operationalContext as Record<string, unknown> | undefined;
          const debit = Number(operational?.['debitTotal'] ?? 0);
          const credit = Number(operational?.['creditTotal'] ?? 0);
          this.debitTotal.set(Number.isFinite(debit) ? debit : 0);
          this.creditTotal.set(Number.isFinite(credit) ? credit : 0);
        },
      });
  }
}
