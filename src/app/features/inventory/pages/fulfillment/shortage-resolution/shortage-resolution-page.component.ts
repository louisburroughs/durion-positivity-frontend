import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ShortageOption, ShortageResolutionResult } from '../../../models/inventory.models';
import { InventoryDomainService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'ready' | 'submitting' | 'resolved' | 'error';

@Component({
  selector: 'app-shortage-resolution-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './shortage-resolution-page.component.html',
  styleUrls: ['./shortage-resolution-page.component.css'],
})
export class ShortageResolutionPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly inventoryService = inject(InventoryDomainService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly options = signal<ShortageOption[]>([]);
  readonly selectedOptionId = signal<string | null>(null);
  readonly result = signal<ShortageResolutionResult | null>(null);

  readonly hasPartialWarning = computed(() =>
    this.options().some(option => option.partialOptionsWarning),
  );

  constructor() {
    this.loadOptions();
  }

  selectOption(optionId: string): void {
    this.selectedOptionId.set(optionId);
  }

  reload(): void {
    this.loadOptions();
  }

  confirm(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const allocationLineId =
      this.route.snapshot.paramMap.get('allocationLineId')
      ?? this.route.snapshot.queryParamMap.get('allocationLineId');
    const selectedOptionId = this.selectedOptionId();
    const selectedOption = this.options().find(option => option.optionId === selectedOptionId);

    if (!workorderId || !allocationLineId || !selectedOption) {
      return;
    }

    this.state.set('submitting');
    this.errorKey.set(null);

    this.inventoryService
      .resolveShortage({
        workorderId,
        allocationLineId,
        optionId: selectedOption.optionId,
        decisionType: selectedOption.decisionType,
        clientRequestId: crypto.randomUUID(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.result.set(result);
          this.state.set('resolved');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.SUBMIT');
        },
      });
  }

  private loadOptions(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const allocationLineId =
      this.route.snapshot.paramMap.get('allocationLineId')
      ?? this.route.snapshot.queryParamMap.get('allocationLineId');

    if (!workorderId || !allocationLineId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.MISSING_ID');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryService
      .getShortageOptions(workorderId, allocationLineId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: options => {
          this.options.set(options);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.LOAD');
        },
      });
  }
}
