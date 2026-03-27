import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CreditMemoListItem } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';

@Component({
  selector: 'app-credit-memo-list-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './credit-memo-list-page.component.html',
  styleUrl: './credit-memo-list-page.component.css',
})
export class CreditMemoListPageComponent implements OnInit {
  private readonly accountingService = inject(AccountingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<PageState>('loading');
  readonly memos = signal<CreditMemoListItem[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.pageState.set('loading');
    this.accountingService
      .listCreditMemos(0, 50)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const items = page.items ?? page.content ?? [];
          this.memos.set(items);
          this.pageState.set(items.length === 0 ? 'not-found' : 'ready');
        },
        error: (err) => {
          this.pageState.set(err?.status === 403 ? 'forbidden' : 'error');
        },
      });
  }

  newMemo(): void {
    this.router.navigate(['/app/accounting/credit-memos/new']);
  }

  openDetail(memo: CreditMemoListItem): void {
    this.router.navigate(['/app/accounting/credit-memos', memo.creditMemoId]);
  }
}
