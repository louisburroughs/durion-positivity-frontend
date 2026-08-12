import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Health tab of the vendor-profile detail screen.
 *
 * ── Why this panel is empty ──────────────────────────────────────────────────
 * The supplier contract exposes **no** health, status roll-up or circuit-breaker
 * endpoint — not under `/v1/supplier/admin/**`, not anywhere in
 * `@durion-sdk/supplier`. An earlier pass called a guessed
 * `/supplier/v1/vendor-profiles/{id}/health` and rendered breaker chips from it;
 * that call has been removed because nothing serves it.
 *
 * The tab stays visible by decision: silently dropping it would leave an
 * operator who has been told health exists hunting for a tab that no longer
 * appears, with no way to tell "removed" from "I clicked the wrong thing". A
 * named, reachable "not yet available" panel is the honest answer.
 *
 * This is **not** an error state. The panel therefore carries no `state` /
 * `errorKey` signals at all (ADR-0031 governs failed loads, and there is no load
 * here to fail), issues no request, and renders a plain informational region.
 * Per-capability circuit-breaker reporting returns when the backend ships an
 * endpoint for it.
 */
@Component({
  selector: 'app-supplier-health-panel',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './supplier-health-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-health-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierHealthPanelComponent {
  /** Kept so the tab shell's binding contract is unchanged; nothing is fetched with it. */
  readonly vendorProfileId = input.required<string>();
}
