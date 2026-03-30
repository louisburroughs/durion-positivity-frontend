import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { combineLatest, of, Subscription, switchMap } from 'rxjs';
import { EstimateListItem } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';

@Component({
  selector: 'app-estimate-list-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './estimate-list-page.component.html',
  styleUrl: './estimate-list-page.component.css',
})
export class EstimateListPageComponent {
  private readonly workexec = inject(WorkexecService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly state = signal<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly estimates = signal<EstimateListItem[]>([]);
  readonly selectedEstimateId = signal<string | null>(null);

  constructor() {
    effect(onCleanup => {
      const sub: Subscription = combineLatest([
        this.route.paramMap,
        this.route.queryParamMap,
      ])
        .pipe(
          switchMap(([paramMap, queryParamMap]) => {
            const customerId = paramMap.get('customerId') ?? queryParamMap.get('customerId');
            const vehicleId = paramMap.get('vehicleId') ?? queryParamMap.get('vehicleId');

            this.state.set('loading');
            this.errorKey.set(null);

            if (customerId) {
              return this.workexec.listEstimatesForCustomer(customerId);
            }

            if (vehicleId) {
              return this.workexec.listEstimatesForVehicle(vehicleId);
            }

            return of<EstimateListItem[]>([]);
          }),
        )
        .subscribe({
          next: estimates => {
            this.estimates.set(estimates);
            this.state.set(estimates.length > 0 ? 'ready' : 'empty');
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('WORKEXEC.ESTIMATE_LIST.ERROR.LOAD');
          },
        });

      onCleanup(() => sub.unsubscribe());
    });
  }

  openEstimateDetail(id: string): void {
    this.selectedEstimateId.set(id);
    this.router.navigate(['../estimates', id], { relativeTo: this.route });
  }
}
