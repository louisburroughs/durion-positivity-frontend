import { Provider, Type } from '@angular/core';
import {
  SUPPLIER_TRANSMISSION_PANELS,
  SupplierTransmissionPanels,
} from '../../../shared/positivity/supplier-transmission-panels.tokens';

/**
 * Registers the `positivity`-backed implementation of
 * `shared/positivity`'s `SupplierTransmissionPanels` contract. Registered
 * once, at the composition root (`app.config.ts`), so a hosting page such as
 * inventory's `po-detail` needs no import from `positivity` directly
 * (LAY-03).
 *
 * Both component classes are loaded via a dynamic `import()` rather than a
 * static one, so they — and the `@durion-sdk` client each wraps — land in
 * their own chunk and are fetched only the first time a page actually
 * renders one, instead of being pulled into the initial bundle by
 * `app.config.ts`.
 */
export function providePositivitySupplierTransmissionPanels(): Provider {
  return {
    provide: SUPPLIER_TRANSMISSION_PANELS,
    useValue: {
      loadSupplierTransmissionPanel: (): Promise<Type<unknown>> =>
        import('../components/supplier-transmission-panel/supplier-transmission-panel.component').then(
          m => m.SupplierTransmissionPanelComponent,
        ),
      loadPurchaseOrderTransmissionTimelinePanel: (): Promise<Type<unknown>> =>
        import(
          '../components/purchase-order-transmission-timeline-panel/purchase-order-transmission-timeline-panel.component'
        ).then(m => m.PurchaseOrderTransmissionTimelinePanelComponent),
    } satisfies SupplierTransmissionPanels,
  };
}
