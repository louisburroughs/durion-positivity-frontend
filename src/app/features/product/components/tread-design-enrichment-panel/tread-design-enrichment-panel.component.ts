import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { TreadDesignEnrichment } from '../../models/tread-design-enrichment.models';
import { ProductTreadDesignService } from '../../services/product-tread-design.service';

/**
 * Vendor-supplied tread-design enrichment panel for Product Detail (#218;
 * originally #195/#196).
 *
 * ── Isolation (DECISION-POSITIVITY-004) ───────────────────────────────────
 * `ProductTreadDesignService.getEnrichmentForProduct` never raises an
 * Observable error — a 404 (no match) and any transport failure both map to
 * `null` there. This panel therefore has no error state of its own to show:
 * an enrichment fetch failure degrades only this panel (it renders nothing),
 * and never touches the host page's `state`/`errorKey`.
 *
 * ── Absence renders nothing ────────────────────────────────────────────────
 * No match (`null`) renders no section at all — not an empty-state message,
 * not a placeholder — matching the #195/#196 rule this issue carries
 * forward.
 *
 * ── Provenance ─────────────────────────────────────────────────────────────
 * Every field here is vendor-supplied marketing content, labelled as such
 * throughout the template so it is never mistaken for catalog-owned product
 * data.
 *
 * ── Phase 2 (backend #1645 / ADR-0060): match state, not manual-source label ─
 * `matchState` is shown when present. `TreadDesignDto` carries no
 * `treadDesignSource`/`MANUAL` field on either this read or the product DTO,
 * so a "manually attached" label is not built here — there is nothing in the
 * generated contract to source it from. Labelling manual attachments is
 * deferred until the contract actually exposes that fact, per the platform
 * rule against guessing at data a read doesn't carry.
 */
@Component({
  selector: 'app-tread-design-enrichment-panel',
  standalone: true,
  imports: [TranslatePipe, DatePipe, LowerCasePipe],
  templateUrl: './tread-design-enrichment-panel.component.html',
  styleUrl: './tread-design-enrichment-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreadDesignEnrichmentPanelComponent {
  private readonly service = inject(ProductTreadDesignService);

  readonly productId = input.required<string>();

  private readonly loading = signal(false);
  readonly enrichment = signal<TreadDesignEnrichment | null>(null);

  /** Nothing to render until the load settles, and nothing after it if there was no match. */
  readonly visible = computed(() => !this.loading() && this.enrichment() !== null);

  readonly primaryText = computed(() => this.enrichment()?.texts.find(t => t.name || t.description) ?? null);

  constructor() {
    effect(onCleanup => {
      const productId = this.productId();
      this.loading.set(true);
      this.enrichment.set(null);

      const sub: Subscription = this.service.getEnrichmentForProduct(productId).subscribe(result => {
        this.enrichment.set(result);
        this.loading.set(false);
      });

      onCleanup(() => sub.unsubscribe());
    });
  }
}
