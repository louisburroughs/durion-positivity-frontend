import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MaterialSymbolPipe } from '../../../../shared/material-symbol.pipe';

/** Semantic tone of a chip. Tone drives colour *in addition to* text + icon, never instead of it. */
export type SupplierStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_ICONS: Readonly<Record<SupplierStatusTone, string>> = {
  neutral: 'radio_button_unchecked',
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  danger: 'error',
};

/**
 * Shared status chip for the supplier (positivity) surfaces.
 *
 * Accessibility contract (ADR-0029 / ADR-0039): the status is carried by a
 * **translated text label plus a distinct glyph**. Colour is decoration only, so
 * the chip stays readable for colour-blind users, in forced-colours mode, and in
 * both themes. The glyph is `aria-hidden` because the visible label already
 * names the status; `descriptionKey` adds an optional screen-reader-only prefix
 * (e.g. "Breaker state:") when the surrounding table column is not self-evident.
 *
 * Deliberately presentational: no injected services, no data loading. Wave B–D
 * surfaces reuse it as-is.
 */
@Component({
  selector: 'app-supplier-status-chip',
  standalone: true,
  imports: [TranslatePipe, MaterialSymbolPipe],
  templateUrl: './supplier-status-chip.component.html',
  styleUrl: './supplier-status-chip.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierStatusChipComponent {
  /** Translation key for the visible status text. Required — a chip is never icon-only. */
  readonly labelKey = input.required<string>();

  /** Semantic tone; drives the default glyph and the colour treatment. */
  readonly tone = input<SupplierStatusTone>('neutral');

  /** Optional Material Symbols name overriding the tone default. */
  readonly icon = input<string | null>(null);

  /** Optional screen-reader-only prefix key, e.g. `POSITIVITY.HEALTH.BREAKER_LABEL`. */
  readonly descriptionKey = input<string | null>(null);

  readonly resolvedIcon = computed(() => this.icon() ?? TONE_ICONS[this.tone()]);

  readonly toneClass = computed(() => `supplier-chip--${this.tone()}`);
}
