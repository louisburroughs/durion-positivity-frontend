import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PostingRuleSet } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type PageState = 'loading' | 'ready' | 'error' | 'forbidden' | 'not-found';

@Component({
  selector: 'app-posting-rules-detail-page',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './posting-rules-detail-page.component.html',
  styleUrl: './posting-rules-detail-page.component.css',
})
export class PostingRulesDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageState = signal<PageState>('loading');
  readonly ruleSet = signal<PostingRuleSet | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const ruleSetId = this.route.snapshot.paramMap.get('ruleSetId') ?? '';
    this.pageState.set('loading');
    this.accountingService
      .getPostingRuleSet(ruleSetId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.ruleSet.set(data);
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
