import { providePositivitySupplierTransmissionPanels } from './supplier-transmission-panels.provider';
import { SupplierTransmissionPanelComponent } from '../components/supplier-transmission-panel/supplier-transmission-panel.component';
import { PurchaseOrderTransmissionTimelinePanelComponent } from '../components/purchase-order-transmission-timeline-panel/purchase-order-transmission-timeline-panel.component';
import { SUPPLIER_TRANSMISSION_PANELS } from '../../../shared/positivity/supplier-transmission-panels.tokens';

describe('providePositivitySupplierTransmissionPanels', () => {
  it('provides the SUPPLIER_TRANSMISSION_PANELS token', () => {
    const provider = providePositivitySupplierTransmissionPanels();

    expect((provider as { provide: unknown }).provide).toBe(SUPPLIER_TRANSMISSION_PANELS);
  });

  it('resolves the real supplier-transmission-panel component class', async () => {
    const provider = providePositivitySupplierTransmissionPanels() as { useValue: unknown };
    const panels = provider.useValue as {
      loadSupplierTransmissionPanel(): Promise<unknown>;
      loadPurchaseOrderTransmissionTimelinePanel(): Promise<unknown>;
    };

    await expect(panels.loadSupplierTransmissionPanel()).resolves.toBe(SupplierTransmissionPanelComponent);
    await expect(panels.loadPurchaseOrderTransmissionTimelinePanel()).resolves.toBe(
      PurchaseOrderTransmissionTimelinePanelComponent,
    );
  });
});
