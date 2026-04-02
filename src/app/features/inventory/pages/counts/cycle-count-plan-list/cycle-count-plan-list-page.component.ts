import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CycleCountPlan } from '../../../models/inventory.models';
import { InventoryCycleCountService } from '../../../services/inventory-cycle-count.service';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

@Component({
  selector: 'app-cycle-count-plan-list-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './cycle-count-plan-list-page.component.html',
  styleUrl: './cycle-count-plan-list-page.component.css',
})
export class CycleCountPlanListPageComponent {
  private readonly cycleCountService = inject(InventoryCycleCountService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly plans = signal<CycleCountPlan[]>([]);

  constructor() {
    this.loadPlans();
  }

  loadPlans(locationId?: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.cycleCountService
      .getCycleCountPlans(locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: plans => {
          this.plans.set(plans);
          this.state.set(plans.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.COUNTS.PLANS.ERROR.LOAD');
        },
      });
  }
}
