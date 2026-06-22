import { CommonModule } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { combineLatest, EMPTY, Subscription, switchMap } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { EstimateListItem } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { CustomerLookupComponent } from '../../../crm/components/customer-lookup/customer-lookup.component';

@Component({
  selector: 'app-estimate-list-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe, CustomerLookupComponent],
  templateUrl: './estimate-list-page.component.html',
  styleUrl: './estimate-list-page.component.css',
})
export class EstimateListPageComponent {
  private readonly workexec = inject(WorkexecService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly customerControl = new FormControl<string>('', { nonNullable: true });

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

            if (!customerId && !vehicleId) {
              this.state.set('idle');
              this.errorKey.set(null);
              return EMPTY;
            }

            this.state.set('loading');
            this.errorKey.set(null);

            if (customerId) {
              return this.workexec.listEstimatesForCustomer(customerId);
            }

            if (vehicleId) {
              return this.workexec.listEstimatesForVehicle(vehicleId);
            }

            return EMPTY;
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
    }, { allowSignalWrites: true });

    // Reflect any existing customerId filter in the lookup.
    const initialCustomerId = this.route.snapshot?.queryParamMap?.get('customerId');
    if (initialCustomerId) {
      this.customerControl.setValue(initialCustomerId, { emitEvent: false });
    }

    // Selecting a customer drives the filter via the customerId query param
    // (shareable URL); the effect above reacts and loads the estimates.
    this.customerControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(customerId => {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { customerId: customerId || null },
          queryParamsHandling: 'merge',
        });
      });
  }

  openEstimateDetail(id: string): void {
    this.selectedEstimateId.set(id);
    this.router.navigate(['../estimates', id], { relativeTo: this.route });
  }
}
