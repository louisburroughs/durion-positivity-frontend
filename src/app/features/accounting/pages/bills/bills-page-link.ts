import { Signal } from '@angular/core';
import { BillSelection } from '../../models/payables.models';

/**
 * What the routed review panel (`bills/:billId`) tells Bills to pay and asks
 * of it. Provided by `BillsPageComponent`, which keeps the list, the counts and
 * the step across bills: the panel is its child route, so picking another bill
 * re-reads only the panel.
 */
export abstract class BillsPageLink {
  /** The bill whose panel is open, or null. */
  abstract readonly selectedBillId: Signal<string | null>;
  abstract select(billId: string | null): void;
  /** A decision landed (or may have): re-read the counts and the list. */
  abstract billChanged(): void;
  /**
   * A candidate selection matched another bill (Q5): announce it, open
   * `bills/{id}` and re-read the counts and list; the chosen step stays.
   */
  abstract openMatched(selection: BillSelection): void;
  /** True once after a row was picked on a small screen: the panel takes focus when it loads (§5.7). */
  abstract takePanelFocus(): boolean;
}
