import { ChangeDetectionStrategy, Component, DestroyRef, Injector, afterNextRender, effect, inject, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { BillReviewPanelComponent } from '../../../components/bills/bill-review-panel/bill-review-panel.component';
import { BillsPageLink } from '../bills-page-link';

/**
 * The child route of Bills to pay: `bills` (no bill picked) and
 * `bills/:billId`. It reads the id straight from the route, so a reload or a
 * shared link opens that bill's panel (§8.1, AC 5); the id is never shown.
 */
@Component({
  selector: 'app-bill-panel-route',
  standalone: true,
  imports: [TranslatePipe, BillReviewPanelComponent],
  templateUrl: './bill-panel-route.component.html',
  styleUrl: './bill-panel-route.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillPanelRouteComponent {
  private readonly route = inject(ActivatedRoute);
  readonly link = inject(BillsPageLink);
  private readonly injector = inject(Injector);

  private readonly panel = viewChild(BillReviewPanelComponent);

  readonly billId = toSignal(this.route.paramMap.pipe(map(params => params.get('billId'))), {
    initialValue: this.route.snapshot?.paramMap?.get('billId') ?? null,
  });

  constructor() {
    effect(() => {
      const billId = this.billId();
      untracked(() => this.link.select(billId));
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.link.selectedBillId() === this.billId()) this.link.select(null);
    });
  }

  /** The loaded bill replaces the loading heading: focus moves once the new one has rendered (ADR-0029 §8.7). */
  onLoaded(): void {
    if (!this.link.takePanelFocus()) return;
    afterNextRender(() => this.panel()?.focusHeading(), { injector: this.injector });
  }
}
