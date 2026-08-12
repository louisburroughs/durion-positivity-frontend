import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { LocaleService } from '../../../../core/services/locale.service';
import { SupplierEnrichmentService } from '../../services/supplier-enrichment.service';
import {
  SupplierEnrichmentImage,
  SupplierProductEnrichment,
} from '../../models/supplier-enrichment.models';
import { isLocaleFallback, resolveLocalizedText } from '../../utils/enrichment-locale.util';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { StalenessIndicatorComponent } from '../staleness-indicator/staleness-indicator.component';

/**
 * `absent` is distinct from `empty`: the product simply has no manufacturer
 * content, which is the ordinary case and renders **nothing**.
 */
type PanelState = 'idle' | 'loading' | 'absent' | 'ready' | 'error' | 'forbidden';

/** One image prepared for rendering: resolved alt text, plus its source. */
export interface EnrichmentImageView {
  imageId: string;
  url: string;
  altText: string;
  role: string | null;
}

/** One attribute prepared for rendering, with both label and value locale-resolved. */
export interface EnrichmentAttributeView {
  code: string;
  label: string;
  value: string;
}

/**
 * Manufacturer marketing-catalog enrichment section for Product Detail (#195).
 *
 * ── Absence renders nothing ─────────────────────────────────────────────────
 * When the backend holds no enrichment the component renders no element at all —
 * no heading, no empty panel, no "no content" message. An empty section would
 * assert that the manufacturer published nothing, and would put a permanent hole
 * in the page for the majority of the catalog that is not enriched. The template
 * is therefore gated on `state() === 'ready'`.
 *
 * ── Enrichment augments, never replaces ─────────────────────────────────────
 * Nothing here overwrites a catalog field. The section is explicitly labelled as
 * manufacturer-provided content and names the vendor it came from, so a user can
 * always tell which facts the platform owns and which the manufacturer supplied.
 *
 * ── Localized vendor text is not UI copy ────────────────────────────────────
 * Manufacturer prose has no translation key; it is vendor data published in
 * whichever locales the manufacturer chose. It is resolved against the user's
 * current locale through `enrichment-locale.util` (exact tag → same language →
 * platform default → first published), and when the resolved text is not in the
 * requested locale the section says so rather than silently showing another
 * language.
 *
 * ── Images (ADR-0020 deviation, recorded deliberately) ──────────────────────
 * ADR-0020 routes binary content through the platform document service. **This
 * repository has no such service** — `core/services/` contains auth, theme,
 * locale, icon-font and the API base only, and no `@durion-sdk` package exposes
 * a document read. Images are therefore rendered from the URL carried in the
 * enrichment payload, `loading="lazy"` so an unopened section costs no
 * bandwidth. When a document service lands, only `imageViews()` changes.
 *
 * An image whose alt text resolves to nothing is **not rendered**: a decorative
 * empty alt would be a lie (these images are informational), and alt text
 * invented here would be fabricated manufacturer metadata.
 */
@Component({
  selector: 'app-supplier-enrichment-panel',
  standalone: true,
  imports: [TranslatePipe, StalenessIndicatorComponent],
  templateUrl: './supplier-enrichment-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-enrichment-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierEnrichmentPanelComponent {
  private readonly enrichmentService = inject(SupplierEnrichmentService);
  private readonly locale = inject(LocaleService);

  /** Catalog product id. Null while the host page is still resolving the route. */
  readonly productId = input<string | null>(null);

  /** Test seam for "now", forwarded to the freshness indicator. */
  readonly nowMs = input<number | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly enrichment = signal<SupplierProductEnrichment | null>(null);

  private readonly reloadToken = signal(0);

  readonly currentLocale = computed(() => this.locale.currentLocale());

  readonly description = computed(() =>
    resolveLocalizedText(this.enrichment()?.descriptions, this.currentLocale()),
  );

  /** True when the prose on screen is not in the user's locale. */
  readonly descriptionIsFallback = computed(() =>
    isLocaleFallback(this.enrichment()?.descriptions, this.currentLocale()),
  );

  readonly imageViews = computed<EnrichmentImageView[]>(() =>
    (this.enrichment()?.images ?? [])
      .map(image => this.toImageView(image))
      .filter((view): view is EnrichmentImageView => view !== null),
  );

  readonly attributeViews = computed<EnrichmentAttributeView[]>(() =>
    (this.enrichment()?.attributes ?? [])
      .map(attribute => ({
        code: attribute.code,
        label: resolveLocalizedText(attribute.label, this.currentLocale()) ?? attribute.code,
        value: resolveLocalizedText(attribute.value, this.currentLocale()) ?? '',
      }))
      .filter(view => view.value !== ''),
  );

  /**
   * True only when there is something worth showing.
   *
   * A payload that carries no usable prose, no renderable image and no attribute
   * is treated as absence: rendering a heading over nothing is the empty section
   * the story forbids, whether the emptiness came from a missing record or from
   * a record with nothing in it.
   */
  readonly hasContent = computed(
    () =>
      !!this.description() || this.imageViews().length > 0 || this.attributeViews().length > 0,
  );

  readonly visible = computed(() => this.state() === 'ready' && this.hasContent());

  constructor() {
    effect(onCleanup => {
      this.reloadToken();
      const productId = this.productId();

      if (!productId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.enrichment.set(null);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.enrichmentService.getProductEnrichment(productId).subscribe({
        next: result => {
          this.enrichment.set(result);
          this.state.set(result ? 'ready' : 'absent');
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.ENRICHMENT.ERROR.LOAD');
          // ADR-0031: state first, then the key.
          this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
          this.errorKey.set(outcome.errorKey);
          this.enrichment.set(null);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  reload(): void {
    this.reloadToken.update(value => value + 1);
  }

  private toImageView(image: SupplierEnrichmentImage): EnrichmentImageView | null {
    const altText = resolveLocalizedText(image.altText, this.currentLocale());
    if (!altText || !image.url) {
      return null;
    }
    return { imageId: image.imageId, url: image.url, altText, role: image.role ?? null };
  }
}
