import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';

/** One labelled fact beneath a timeline entry. */
export interface SupplierTimelineDetail {
  /** Translation key for the term. Always translated — this is UI copy. */
  termKey: string;
  /** The value. Vendor data, rendered verbatim (ADR-0030). */
  value: string;
  /**
   * Set when the value is an instant rather than prose.
   *
   * The detail is then rendered as a real `<time datetime="…">` element and
   * formatted for the user's locale, so a second time fact on an entry (an
   * ingest time beside a carrier event time) stays machine-readable instead of
   * becoming a raw ISO string in the middle of a sentence.
   */
  datetime?: string | null;
}

/**
 * One entry on an append-only vendor timeline.
 *
 * `labelKey` and `labelText` are mutually exclusive: a recognised vendor code
 * gets a translated key, an unrecognised one is shown verbatim as `labelText`.
 * An unknown code therefore *appears* rather than silently disappearing or
 * rendering a raw translation key at the user.
 */
export interface SupplierTimelineEntry {
  id: string;
  /** Instant the event occurred, per the vendor. The ordering key. */
  occurredAt: string;
  /** Translation key for the entry label, when the code is recognised. */
  labelKey?: string | null;
  /** Verbatim vendor token, used when there is no recognised key. */
  labelText?: string | null;
  /** Material Symbols name. Decorative — the text label carries the meaning. */
  icon: string;
  details: SupplierTimelineDetail[];
}

/**
 * Shared append-only timeline for supplier surfaces (issues #191, #193).
 *
 * ── Append-only, and structurally so ────────────────────────────────────────
 * This component takes a list and renders it. It has no output, no mutation
 * method, no dismiss/hide control and no client-side sort key of its own: the
 * caller passes entries already ordered by `occurredAt` and this component
 * preserves that order exactly. Nothing a user can do here changes what the
 * vendor said or the order in which they said it — which is the whole point of
 * a status/shipment history that gets read back during a delivery dispute.
 *
 * ── List semantics, not a coloured strip ────────────────────────────────────
 * Entries are `<li>` inside an `<ol>` so assistive technology announces
 * position and count, and each timestamp is a real `<time datetime="…">`
 * element. The status of an entry is carried by **translated text plus a
 * distinct glyph**; the connector line and any colour are decoration only
 * (ADR-0029). Removing all colour leaves the timeline fully readable.
 */
@Component({
  selector: 'app-supplier-event-timeline',
  standalone: true,
  imports: [DatePipe, TranslatePipe, MaterialSymbolPipe],
  templateUrl: './supplier-event-timeline.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-event-timeline.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierEventTimelineComponent {
  /** Entries in display order. Rendered exactly as given — never re-sorted here. */
  readonly entries = input<readonly SupplierTimelineEntry[]>([]);

  /** Translation key for the list's accessible name. */
  readonly ariaLabelKey = input<string>('POSITIVITY.TIMELINE.ARIA_LABEL');

  /** Translation key shown when the vendor has reported nothing yet. */
  readonly emptyKey = input<string>('POSITIVITY.TIMELINE.EMPTY');

  readonly isEmpty = computed(() => this.entries().length === 0);
}
