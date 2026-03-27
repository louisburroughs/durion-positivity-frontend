import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CreditMemo } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';

@Component({
  selector: 'app-credit-memo-detail-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './credit-memo-detail-page.component.html',
  styleUrl: './credit-memo-detail-page.component.css',
})
export class CreditMemoDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<PageState>('loading');
  readonly memo = signal<CreditMemo | null>(null);

  ngOnInit(): void {
    const memoId = this.route.snapshot.paramMap.get('memoId') ?? '';
    this.accountingService
      .getCreditMemo(memoId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.memo.set(data);
          this.pageState.set('ready');
        },
        error: (err) => {
          if (err?.status === 403) this.pageState.set('forbidden');
          else if (err?.status === 404) this.pageState.set('not-found');
          else this.pageState.set('error');
        },
      });
  }
}
