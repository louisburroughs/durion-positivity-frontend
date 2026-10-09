import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import axe from 'axe-core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../../assets/i18n/en-US.json';
import { AuthService } from '../../../../../core/services/auth.service';
import { SupplierVendorRosterService } from '../../../../../shared/supplier-vendors/services/supplier-vendor-roster.service';
import { PurchaseOrderDetail } from '../../../models/inventory.models';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { PoFormComponent } from './po-form.component';

/**
 * Genuine axe coverage of the RENDERED purchase-order form (CAP:550, #514) in
 * both themes, with the real en-US copy: the vendor picker with a refusal, the
 * blocked Submit, and an edited DRAFT order prompted to change its inactive
 * vendor. `scripts/a11y/smoke-routes.mjs` scans `/app/inventory/purchase-orders/new`
 * too, but only sees the un-hydrated shell.
 */
async function seriousViolations(root: HTMLElement): Promise<{ id: string; targets: string[] }[]> {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
  });
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target.join(' ')) }));
}

const THEMES = ['light', 'dark'] as const;

const order: PurchaseOrderDetail = {
  poId: 'po-001',
  poNumber: 'PO-001',
  status: 'DRAFT',
  supplierId: 'vendor-9',
  lineCount: 1,
  openBalance: 0,
  scheduledDeliveryDate: '2026-11-02',
  lines: [{ poLineId: 'l1', productSku: 'SKU-1', orderedQty: 2, receivedQty: 0, unitPrice: 4.5, status: 'OPEN' }],
  poDate: '2026-10-01',
};

function render(poId: string | null, permissions: readonly string[]): { host: HTMLElement; component: PoFormComponent; detect: () => void } {
  const auth = {
    currentUserClaims: signal({ sub: 'buyer.a' }),
    tenantId: signal('tenant-1'),
    permissionsKnown: () => true,
    hasPermission: (code: string) => permissions.includes(code),
    hasAnyPermission: (codes: readonly string[]) => codes.some(code => permissions.includes(code)),
  };
  TestBed.configureTestingModule({
    imports: [PoFormComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      {
        provide: InventoryPurchaseOrderService,
        useValue: {
          getPurchaseOrder: vi.fn(() => of(order)),
          createPurchaseOrder: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'VENDOR_INACTIVE' } }))),
          revisePurchaseOrder: vi.fn(),
        },
      },
      {
        provide: SupplierVendorRosterService,
        useValue: {
          listActiveVendors: vi.fn(() =>
            of({ vendors: [{ vendorId: 'vendor-1', vendorNumber: 'V-000001', displayName: 'Acme Parts', active: true }], truncated: false }),
          ),
          getVendor: vi.fn(() => of({ vendorId: 'vendor-9', vendorNumber: 'V-000009', displayName: 'Retired Co', active: false })),
        },
      },
      { provide: AuthService, useValue: auth },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => poId } } } },
    ],
  });
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('en-US', enUS as TranslationObject);
  translate.use('en-US');
  const fixture = TestBed.createComponent(PoFormComponent);
  const host = fixture.nativeElement as HTMLElement;
  host.setAttribute('data-a11y-host', '');
  document.body.appendChild(host);
  const detect = (): void => {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  };
  detect();
  return { host, component: fixture.componentInstance, detect };
}

describe('Purchase-order form a11y (rendered DOM)', () => {
  // The body fades between themes over 250ms (styles.css); axe would measure contrast mid-fade.
  beforeEach(() => {
    document.body.style.transition = 'none';
  });

  afterEach(() => {
    document.body.style.removeProperty('transition');
    document.documentElement.removeAttribute('data-theme');
    document.body.querySelectorAll('[data-a11y-host]').forEach(node => node.remove());
    TestBed.resetTestingModule();
  });

  for (const theme of THEMES) {
    it(`new order with a vendor refusal: no serious violations (${theme})`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { host, component, detect } = render(null, ['order:purchase_order:create', 'supplier:vendor:read']);
      component.chooseVendor('vendor-1');
      component.addLine();
      component.submit();
      detect();

      expect(host.querySelector('[data-testid="po-form-error"]')).not.toBeNull();
      expect(host.querySelector('#po-vendor')?.getAttribute('aria-invalid')).toBe('true');
      expect(await seriousViolations(host)).toEqual([]);
    });

    it(`new order without the vendor read (Submit blocked): no serious violations (${theme})`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { host } = render(null, ['order:purchase_order:create']);

      expect(host.querySelector('[data-testid="po-submit"]')?.getAttribute('aria-disabled')).toBe('true');
      expect(await seriousViolations(host)).toEqual([]);
    });

    it(`DRAFT order prompted to change its inactive vendor: no serious violations (${theme})`, async () => {
      document.documentElement.setAttribute('data-theme', theme);
      const { host } = render('po-001', ['order:purchase_order:create', 'supplier:vendor:read']);

      expect(host.querySelector('[data-testid="po-vendor-prompt"]')).not.toBeNull();
      expect(await seriousViolations(host)).toEqual([]);
    });
  }
});
