import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { BILLING_SECTION } from '../../../../core/security/route-permissions';
import { ReceiptRef } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { ReceiptPageComponent } from './receipt-page.component';

const receiptFixture: ReceiptRef = {
  receiptId: 'rcpt-001',
  invoiceId: 'inv-001',
  paymentId: 'pay-001',
  receiptNumber: 'R-1001',
  generatedAt: '2026-03-30T10:00:00Z',
  emailedTo: 'cashier@example.com',
  pdfUrl: 'https://example.test/r/R-1001.pdf',
};

const receiptDetailFixture: ReceiptRef = {
  receiptId: 'rcpt-001',
  invoiceId: 'inv-001',
  paymentId: 'pay-001',
  receiptNumber: 'R-1001',
  status: 'GENERATED',
  paidAmount: 42.5,
  paymentMethod: 'stripe',
  cashierId: 'cashier-1',
  terminalId: 'WEB-UI',
  reprintCount: 1,
  createdAt: '2026-03-30T10:00:00Z',
};

function routeStubWith(invoiceId: string | null, receiptId: string | null) {
  return {
    snapshot: {
      paramMap: {
        get: (key: string) => {
          if (key === 'invoiceId') {
            return invoiceId;
          }
          if (key === 'receiptId') {
            return receiptId;
          }
          return null;
        },
      },
    },
  };
}

describe('ReceiptPageComponent', () => {
  let fixture: ComponentFixture<ReceiptPageComponent>;
  let component: ReceiptPageComponent;

  const billingTransportStub = {
    generateReceipt: vi.fn(),
    reprintReceipt: vi.fn(),
    loadReceipt: vi.fn(),
  };

  /** `null` = token with no permission claim (permissions unknown), as in AuthService. */
  const session: { permissions: string[] | null } = { permissions: null };
  const authStub = {
    permissionsKnown: () => session.permissions !== null,
    hasAnyPermission: (permissions: readonly string[]) =>
      permissions.some(p => session.permissions?.includes(p) ?? false),
  };

  async function configure(invoiceId: string | null, receiptId: string | null): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ReceiptPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStubWith(invoiceId, receiptId) },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  }

  function create(): void {
    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    session.permissions = null;
    billingTransportStub.generateReceipt.mockReset();
    billingTransportStub.reprintReceipt.mockReset();
    billingTransportStub.loadReceipt.mockReset();
    billingTransportStub.loadReceipt.mockReturnValue(of(receiptDetailFixture));
    await configure('inv-001', 'rcpt-001');
  });

  describe('receipt deep-link load (durion-positivity-backend#2214)', () => {
    it('loads the receipt via getReceipt when a receiptId is already in the route', () => {
      create();

      expect(billingTransportStub.loadReceipt).toHaveBeenCalledWith('inv-001', 'rcpt-001');
      expect(component.state()).toBe('ready');
      expect(component.receipt()).toEqual(receiptDetailFixture);
    });

    it('maps a 404 from loadReceipt to a not-found key', async () => {
      billingTransportStub.loadReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404 })),
      );
      create();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.NOT_FOUND');
    });

    it('maps a 403 from loadReceipt to a load-specific permission error, not the generate one', async () => {
      billingTransportStub.loadReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );
      create();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.LOAD_PERMISSION_DENIED');
    });

    it('maps a 403 with a LOCATION_SCOPE_DENIED body code from loadReceipt to the location-scope key', async () => {
      billingTransportStub.loadReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'LOCATION_SCOPE_DENIED' } })),
      );
      create();

      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.LOCATION_SCOPE_DENIED');
    });

    it('a non-404/403 failure from loadReceipt keeps the generic load error key', async () => {
      billingTransportStub.loadReceipt.mockReturnValue(throwError(() => new Error('boom')));
      create();

      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.LOAD');
    });
  });

  it('sets idle state and makes no service calls when no receiptId is in the route', async () => {
    await configure('inv-001', null);
    create();

    expect(component.state()).toBe('idle');
    expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
    expect(billingTransportStub.reprintReceipt).not.toHaveBeenCalled();
    expect(billingTransportStub.loadReceipt).not.toHaveBeenCalled();
  });

  it('sets ready state and populates the receipt directly from generateReceipt(), with no follow-up load call (issue #381)', async () => {
    await configure('inv-001', null);
    billingTransportStub.generateReceipt.mockReturnValue(of(receiptFixture));
    create();

    component.generateAndShow({ deliveryMethod: 'PRINT' });

    expect(billingTransportStub.generateReceipt).toHaveBeenCalledWith('inv-001', { deliveryMethod: 'PRINT' }, undefined);
    expect(component.state()).toBe('ready');
    expect(component.receipt()).toEqual(receiptFixture);
    expect(component.receiptId()).toBe('rcpt-001');
  });

  it('sets error state before errorKey when generateAndShow fails', async () => {
    await configure('inv-001', null);
    create();

    billingTransportStub.generateReceipt.mockReturnValue(throwError(() => new Error('gen failed')));

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.generateAndShow({ deliveryMethod: 'PRINT' });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.GENERATE');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state before errorKey when reprint fails', () => {
    create();

    billingTransportStub.reprintReceipt.mockReturnValue(throwError(() => new Error('reprint fail')));

    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.reprint();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.REPRINT');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  it('sets error state when generateAndShow called before invoiceId is available', async () => {
    await configure(null, null);
    create();
    // ngOnInit leaves invoiceId as '' (initial signal value) when the route carries none.

    component.generateAndShow({ deliveryMethod: 'PRINT' });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.MISSING_INVOICE');
    expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
  });

  describe('receiptId present but invoiceId missing', () => {
    it('sets error state when invoiceId is empty and receiptId is present, without calling the service', async () => {
      await configure('', 'rcpt-001');
      create();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.MISSING_INVOICE');
      expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
      expect(billingTransportStub.reprintReceipt).not.toHaveBeenCalled();
      expect(billingTransportStub.loadReceipt).not.toHaveBeenCalled();
    });
  });

  describe('generate gate (durion-positivity-backend#2226, catalog v92)', () => {
    it('grants generate when the permission claim is unknown (legacy token)', async () => {
      await configure('inv-001', null);
      create();
      expect(component.canGeneratePermission()).toBe(true);
    });

    it('grants generate when the session holds invoice:receipt:generate', async () => {
      session.permissions = [...BILLING_SECTION.receiptGenerate];
      await configure('inv-001', null);
      create();
      expect(component.canGeneratePermission()).toBe(true);
    });

    it('denies generate and shows a hint when permissions are known but the code is absent', async () => {
      session.permissions = [];
      await configure('inv-001', null);
      create();

      expect(component.canGeneratePermission()).toBe(false);
      expect(component.canGenerate()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="generate-permission-hint"]')).toBeTruthy();
    });
  });

  describe('reprint-over-cap override (durion-positivity-backend#2214 reprintCount, #2226 reprint_override)', () => {
    it('below the threshold, reprint needs no permission — always allowed', async () => {
      session.permissions = [];
      billingTransportStub.loadReceipt.mockReturnValue(
        of({ ...receiptDetailFixture, reprintCount: 4 }),
      );
      await configure('inv-001', 'rcpt-001');
      create();

      expect(component.reprintOverrideNeeded()).toBe(false);
      expect(component.canReprint()).toBe(true);
    });

    it('at/past the threshold with the override permission unknown (legacy token), reprint stays allowed', async () => {
      billingTransportStub.loadReceipt.mockReturnValue(
        of({ ...receiptDetailFixture, reprintCount: 5 }),
      );
      await configure('inv-001', 'rcpt-001');
      create();

      expect(component.reprintOverrideNeeded()).toBe(true);
      expect(component.canReprint()).toBe(true);
    });

    it('at/past the threshold with permissions known but the override code absent, reprint is disabled', async () => {
      session.permissions = [];
      billingTransportStub.loadReceipt.mockReturnValue(
        of({ ...receiptDetailFixture, reprintCount: 5 }),
      );
      await configure('inv-001', 'rcpt-001');
      create();

      expect(component.canReprint()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="reprint-cap-warning"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.receipt__reprint-btn').disabled).toBe(true);
    });

    it('at/past the threshold with the override code held, reprint is allowed', async () => {
      session.permissions = [...BILLING_SECTION.receiptReprintOverride];
      billingTransportStub.loadReceipt.mockReturnValue(
        of({ ...receiptDetailFixture, reprintCount: 6 }),
      );
      await configure('inv-001', 'rcpt-001');
      create();

      expect(component.canReprint()).toBe(true);
    });

    it('maps a 403 past the cap to the reprint-override-required key', async () => {
      billingTransportStub.loadReceipt.mockReturnValue(
        of({ ...receiptDetailFixture, reprintCount: 5 }),
      );
      await configure('inv-001', 'rcpt-001');
      create();

      billingTransportStub.reprintReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );
      component.reprint();

      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.REPRINT_OVERRIDE_REQUIRED');
    });
  });

  describe('403/location-scope mapping (durion-positivity-backend#2226/#2225/#2227/#2228)', () => {
    it('maps a plain 403 from generateAndShow to a localized permission error', async () => {
      await configure('inv-001', null);
      create();

      billingTransportStub.generateReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );

      component.generateAndShow({ deliveryMethod: 'PRINT' });

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.GENERATE_PERMISSION_DENIED');
    });

    it('maps a 403 with a LOCATION_SCOPE_DENIED body code from generateAndShow to the location-scope key', async () => {
      await configure('inv-001', null);
      create();

      billingTransportStub.generateReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'LOCATION_SCOPE_DENIED' } })),
      );

      component.generateAndShow({ deliveryMethod: 'PRINT' });

      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.LOCATION_SCOPE_DENIED');
    });

    it('maps a plain 403 from reprint to a localized permission error', () => {
      create();

      billingTransportStub.reprintReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );

      component.reprint();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.REPRINT_PERMISSION_DENIED');
    });

    it('maps a 403 with a LOCATION_SCOPE_DENIED body code from reprint to the location-scope key', () => {
      create();

      billingTransportStub.reprintReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'LOCATION_SCOPE_DENIED' } })),
      );

      component.reprint();

      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.LOCATION_SCOPE_DENIED');
    });

    it('a non-403 failure from generateAndShow keeps the generic error key', async () => {
      await configure('inv-001', null);
      create();

      billingTransportStub.generateReceipt.mockReturnValue(throwError(() => new Error('boom')));

      component.generateAndShow({ deliveryMethod: 'PRINT' });

      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.GENERATE');
    });
  });

  describe('method-level permission re-checks (ADR-0040 §6a.2)', () => {
    it('refuses generateAndShow in the method too, not only on the button, when the generate code is absent', async () => {
      session.permissions = [];
      await configure('inv-001', null);
      create();

      component.generateAndShow({ deliveryMethod: 'PRINT' });

      expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
      expect(component.state()).toBe('idle');
    });

    it('refuses reprint in the method too, not only on the button, once the reprint cap requires an override the caller lacks', async () => {
      session.permissions = [];
      billingTransportStub.loadReceipt.mockReturnValue(
        of({ ...receiptDetailFixture, reprintCount: 5 }),
      );
      await configure('inv-001', 'rcpt-001');
      create();
      expect(component.canReprint()).toBe(false);

      component.reprint();

      expect(billingTransportStub.reprintReceipt).not.toHaveBeenCalled();
    });
  });

  describe('reprint preserves the authoritative reprint count (receipt-page.component.ts:54 / billing-transport.service.ts:433)', () => {
    it('re-reads the receipt via getReceipt after a successful reprint, so reprintCount (and reprintOverrideNeeded) reflect the server, not a bare ReceiptResponse missing the field', async () => {
      // No invoice:receipt:reprint_override throughout — below the threshold this is irrelevant
      // (reprint stays allowed), but it must start blocking the moment the reload reports count 5.
      session.permissions = [];
      billingTransportStub.loadReceipt.mockReturnValueOnce(
        of({ ...receiptDetailFixture, reprintCount: 4 }),
      );
      await configure('inv-001', 'rcpt-001');
      create();

      expect(component.reprintOverrideNeeded()).toBe(false);
      expect(component.canReprint()).toBe(true);

      // `reprintReceipt`'s real response (`ReceiptResponse`) has no `reprintCount` — the fixture
      // below models that shape so a regression back to replacing `receipt()` with it directly
      // would drop the count silently.
      billingTransportStub.reprintReceipt.mockReturnValue(
        of({ receiptId: 'rcpt-001', invoiceId: 'inv-001', receiptNumber: 'R-1001' }),
      );
      billingTransportStub.loadReceipt.mockReturnValueOnce(
        of({ ...receiptDetailFixture, reprintCount: 5 }),
      );

      component.reprint();

      expect(billingTransportStub.loadReceipt).toHaveBeenCalledTimes(2);
      expect(billingTransportStub.loadReceipt).toHaveBeenLastCalledWith('inv-001', 'rcpt-001');
      expect(component.receipt()?.reprintCount).toBe(5);
      expect(component.reprintOverrideNeeded()).toBe(true);

      // A caller without invoice:receipt:reprint_override is now blocked by the real count.
      expect(component.canReprintPastCap()).toBe(false);
      expect(component.canReprint()).toBe(false);
    });

    it('blocks another reprint when the post-reprint re-read fails (the displayed count is stale, ADR-0064)', async () => {
      billingTransportStub.loadReceipt.mockReturnValueOnce(of({ ...receiptDetailFixture, reprintCount: 1 }));
      await configure('inv-001', 'rcpt-001');
      create();
      expect(component.canReprint()).toBe(true);

      billingTransportStub.reprintReceipt.mockReturnValue(
        of({ receiptId: 'rcpt-001', invoiceId: 'inv-001', receiptNumber: 'R-1001' }),
      );
      billingTransportStub.loadReceipt.mockReturnValueOnce(throwError(() => new Error('read failed')));
      billingTransportStub.reprintReceipt.mockClear();

      component.reprint();

      expect(component.state()).toBe('error');
      expect(component.canReprint()).toBe(false);
      component.reprint();
      expect(billingTransportStub.reprintReceipt).toHaveBeenCalledTimes(1);
    });

    it('maps a 403 from the post-reprint re-read to the load key, not a reprint failure (the POST succeeded)', async () => {
      billingTransportStub.loadReceipt.mockReturnValueOnce(of({ ...receiptDetailFixture, reprintCount: 1 }));
      await configure('inv-001', 'rcpt-001');
      create();

      billingTransportStub.reprintReceipt.mockReturnValue(
        of({ receiptId: 'rcpt-001', invoiceId: 'inv-001', receiptNumber: 'R-1001' }),
      );
      billingTransportStub.loadReceipt.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 403 })));

      component.reprint();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.LOAD_PERMISSION_DENIED');
      expect(component.canReprint()).toBe(false);
    });

    it('still allows a retry when the reprint itself fails (the displayed detail was never superseded)', async () => {
      billingTransportStub.loadReceipt.mockReturnValueOnce(of({ ...receiptDetailFixture, reprintCount: 1 }));
      await configure('inv-001', 'rcpt-001');
      create();

      billingTransportStub.reprintReceipt.mockReturnValue(throwError(() => new Error('reprint failed')));

      component.reprint();

      expect(component.state()).toBe('error');
      expect(component.canReprint()).toBe(true);
    });
  });

  describe('receipt status rendering (ADR-0065 allowlisted translation)', () => {
    it('maps GENERATED to its translation key rather than rendering the raw enum', () => {
      create();
      expect(component.receiptStatusKey('GENERATED')).toBe('BILLING.RECEIPT.STATUS.GENERATED');

      const statusRow = fixture.nativeElement.querySelector('.receipt__detail .receipt__field-row:nth-child(3) strong');
      expect(statusRow.textContent.trim()).toBe('BILLING.RECEIPT.STATUS.GENERATED');
      expect(statusRow.textContent.trim()).not.toBe('GENERATED');
    });

    it('falls back to COMMON.NOT_AVAILABLE for an unrecognized status value', () => {
      create();
      expect(component.receiptStatusKey('SOMETHING_NEW')).toBe('COMMON.NOT_AVAILABLE');
      expect(component.receiptStatusKey(undefined)).toBe('COMMON.NOT_AVAILABLE');
    });
  });
});
