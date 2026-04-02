import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PickListView } from '../../../../workexec/models/workexec.models';
import { WorkexecService } from '../../../../workexec/services/workexec.service';

type PageState = 'idle' | 'loading' | 'ready' | 'error' | 'empty';

@Component({
  selector: 'app-pick-list-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe, RouterModule],
  templateUrl: './pick-list-page.component.html',
  styleUrls: ['./pick-list-page.component.css'],
})
export class PickListPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workexecService = inject(WorkexecService);
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
    this.workexecService
      .getWorkorderPickList(this.workorderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.pickList.set(result);
          this.state.set(result.tasks.length === 0 ? 'empty' : 'ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.PICK_LIST.ERROR.LOAD');
        },
      });
  }

  printPage(): void {
    globalThis.print();
  }
}
