import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  MechanicRosterEntryResponseStatusEnum,
  type MechanicRosterEntryResponse,
} from '@durion-sdk/shop-manager';
import { Subscription } from 'rxjs';

import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';
import { ShopmgmtRosterService } from '../../services/shopmgmt-roster.service';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

function toNonNegativeInteger(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
}

@Component({
  selector: 'app-mechanic-roster-page',
  imports: [DatePipe, MaterialSymbolPipe, TranslatePipe],
  templateUrl: './mechanic-roster-page.component.html',
  styleUrl: './mechanic-roster-page.component.css',
})
export class MechanicRosterPageComponent {
  private readonly rosterService = inject(ShopmgmtRosterService);
  private readonly reloadToken = signal(0);

  readonly statusEnum = MechanicRosterEntryResponseStatusEnum;
  readonly statusOptions = [
    MechanicRosterEntryResponseStatusEnum.Active,
    MechanicRosterEntryResponseStatusEnum.Inactive,
    MechanicRosterEntryResponseStatusEnum.OnLeave,
  ] as const;
  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly mechanics = signal<MechanicRosterEntryResponse[]>([]);
  readonly statusFilter = signal(MechanicRosterEntryResponseStatusEnum.Active);
  readonly page = signal(0);
  readonly pageSize = signal(20);
  readonly totalPages = signal(0);
  readonly totalElements = signal(0);
  readonly hasPreviousPage = computed(() => this.page() > 0);
  readonly hasNextPage = computed(
    () => this.totalPages() > 0 && this.page() + 1 < this.totalPages(),
  );
  readonly displayedPage = computed(() => (this.totalPages() > 0 ? this.page() + 1 : 0));

  constructor() {
    effect((onCleanup) => {
      this.reloadToken();
      const query = {
        status: this.statusFilter(),
        page: this.page(),
        size: this.pageSize(),
      };

      this.state.set('loading');
      this.errorKey.set(null);

      const subscription: Subscription = this.rosterService.listMechanics(query).subscribe({
        next: (response) => {
          this.mechanics.set(Array.isArray(response.content) ? response.content : []);
          this.totalPages.set(toNonNegativeInteger(response.page?.totalPages));
          this.totalElements.set(toNonNegativeInteger(response.page?.totalElements));
          this.state.set('ready');
        },
        error: () => {
          this.mechanics.set([]);
          this.totalPages.set(0);
          this.totalElements.set(0);
          this.state.set('error');
          this.errorKey.set('SHOPMGMT.MECHANIC_ROSTER.ERROR.LOAD_MECHANICS');
        },
      });

      onCleanup(() => subscription.unsubscribe());
    });
  }

  changeStatus(status: MechanicRosterEntryResponseStatusEnum): void {
    this.page.set(0);
    this.statusFilter.set(status);
  }

  onStatusChange(event: Event): void {
    const status = (event.target as HTMLSelectElement).value as MechanicRosterEntryResponseStatusEnum;
    if (this.statusOptions.includes(status)) {
      this.changeStatus(status);
    }
  }

  previousPage(): void {
    if (this.hasPreviousPage()) {
      this.page.update((page) => page - 1);
    }
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.page.update((page) => page + 1);
    }
  }

  retry(): void {
    this.reloadToken.update((value) => value + 1);
  }

  getDisplayName(mechanic: MechanicRosterEntryResponse): string {
    return [mechanic.firstName, mechanic.lastName].filter(Boolean).join(' ').trim();
  }
}
