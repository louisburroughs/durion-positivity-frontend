import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { EventEnvelopeContract } from '../../models/accounting.models';
import { AccountingService } from '../../services/accounting.service';

type ContractState = 'loading' | 'ready' | 'forbidden' | 'error';
type ContractTab = 'fields' | 'traceability' | 'examples';

@Component({
  selector: 'app-event-envelope-contract-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './event-envelope-contract-page.component.html',
  styleUrl: './event-envelope-contract-page.component.css',
})
export class EventEnvelopeContractPageComponent implements OnInit {
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<ContractState>('loading');
  readonly activeTab = signal<ContractTab>('fields');
  readonly contract = signal<EventEnvelopeContract | null>(null);

  ngOnInit(): void {
    this.loadContract();
  }

  private loadContract(): void {
    this.pageState.set('loading');
    this.accountingService
      .getEventEnvelopeContract()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: value => {
          this.contract.set(value);
          this.pageState.set('ready');
        },
        error: err => {
          const status = err?.status ?? 0;
          if (status === 403) {
            this.pageState.set('forbidden');
            return;
          }

          this.pageState.set('error');
        },
      });
  }
}
