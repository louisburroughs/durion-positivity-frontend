import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PostingRuleSetListItem } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type RulesState = 'loading' | 'ready' | 'error' | 'forbidden';

@Component({
  selector: 'app-posting-rules-list-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './posting-rules-list-page.component.html',
  styleUrl: './posting-rules-list-page.component.css',
})
export class PostingRulesListPageComponent implements OnInit {
  private readonly accountingService = inject(AccountingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<RulesState>('loading');
  readonly ruleSets = signal<PostingRuleSetListItem[]>([]);

  ngOnInit(): void {
    this.accountingService
      .listPostingRuleSets(0, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: resp => {
          this.ruleSets.set(resp.items ?? resp.content ?? []);
          this.pageState.set('ready');
        },
        error: err => {
          this.pageState.set((err?.status ?? 0) === 403 ? 'forbidden' : 'error');
        },
      });
  }

  openDetail(item: PostingRuleSetListItem): void {
    if (!item.postingRuleSetId) {
      return;
    }
    this.router.navigate(['/app/accounting/posting-rules', item.postingRuleSetId]);
  }

  newRuleSet(): void {
    this.router.navigate(['/app/accounting/posting-rules/new']);
  }
}
