import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PickListView } from '../../../models/inventory-pick.models';
import { InventoryPickService } from '../../../services/inventory-pick.service';

type PageState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

/** The backend's error code for a caller whose location scope does not cover
 * the workorder's own site (#2204/#2225) — the pick-facade reads are now
 * location-scoped, so this page's load can answer it as a 403. */
function isLocationScopeDenied(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 403 && err.error?.code === 'LOCATION_SCOPE_DENIED';
}

@Component({
  selector: 'app-pick-list-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe, RouterModule],
  templateUrl: './pick-list-page.component.html',
  styleUrls: ['./pick-list-page.component.css'],
})
export class PickListPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly pickService = inject(InventoryPickService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workorderId = this.route.snapshot.paramMap.get('workorderId');

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly pickList = signal<PickListView | null>(null);

  constructor() {
    this.loadPickList();
  }

  reload(): void {
    this.loadPickList();
  }

  private loadPickList(): void {
    if (!this.workorderId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.PICK_LIST.ERROR.MISSING_ID');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);
    this.pickService
      .getWorkorderPickList(this.workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          // null: the workorder has no pick list yet — the empty state, not a failure (#286).
          this.pickList.set(result);
          this.state.set(!result || result.tasks.length === 0 ? 'empty' : 'ready');
        },
        error: err => {
          this.state.set('error');
          this.errorKey.set(
            isLocationScopeDenied(err)
              ? 'INVENTORY.FULFILLMENT.PICK_LIST.ERROR.LOCATION_SCOPE_DENIED'
              : 'INVENTORY.FULFILLMENT.PICK_LIST.ERROR.LOAD',
          );
        },
      });
  }

  printPage(): void {
    globalThis.print();
  }
}
