import { InjectionToken, Type } from '@angular/core';

/**
 * Inversion point for positivity's two supplier/PO-transmission panels
 * (#191, #215). A page that hosts them — currently only inventory's
 * `po-detail` — only knows this contract, never positivity's component
 * classes directly (LAY-03). The `positivity` feature provides the real
 * implementation once, at the composition root (`app.config.ts`), via
 * `providePositivitySupplierTransmissionPanels()`.
 *
 * Each loader is async (a dynamic `import()` under the hood) so the panel's
 * own generated `@durion-sdk` client stays out of `main` and is fetched only
 * when a hosting page actually renders it, same as `provideCrmCustomerLookupSource`.
 * The host renders the resolved `Type` with `NgComponentOutlet`, passing the
 * inputs both panels' components already declare via signal `input()`.
 */
export interface SupplierTransmissionPanels {
  /** `app-supplier-transmission-panel`: inputs `purchaseOrderId`, `poNumber`. */
  loadSupplierTransmissionPanel(): Promise<Type<unknown>>;
  /** `app-purchase-order-transmission-timeline-panel`: input `purchaseOrderId`. */
  loadPurchaseOrderTransmissionTimelinePanel(): Promise<Type<unknown>>;
}

export const SUPPLIER_TRANSMISSION_PANELS = new InjectionToken<SupplierTransmissionPanels>(
  'SUPPLIER_TRANSMISSION_PANELS',
);
