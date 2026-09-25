import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { ReceiptRef } from '../../models/billing.models';
import { BillingTransportService } from '../../services/billing-transport.service';
import { ReceiptPageComponent } from './receipt-page.component';

const GENERATE_RECEIPT = 'GENERATE_RECEIPT';

const receiptFixture: ReceiptRef = {
  receiptId: 'rcpt-001',
  invoiceId: 'inv-001',
  paymentId: 'pay-001',
  receiptNumber: 'R-1001',
  generatedAt: '2026-03-30T10:00:00Z',
  emailedTo: 'cashier@example.com',
  pdfUrl: 'https://example.test/r/R-1001.pdf',
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
  };

  /** Permissions known, reprint authority held, unless a test narrows this before `setup()`. */
  const authStub = {
    known: true,
    granted: [GENERATE_RECEIPT] as readonly string[],
    permissionsKnown(): boolean {
      return this.known;
    },
    hasAnyPermission(required: readonly string[]): boolean {
      return required.some(code => this.granted.includes(code));
    },
  };

  beforeEach(async () => {
    billingTransportStub.generateReceipt.mockReset();
    billingTransportStub.reprintReceipt.mockReset();
    authStub.known = true;
    authStub.granted = [GENERATE_RECEIPT];

    await TestBed.configureTestingModule({
      imports: [ReceiptPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStubWith('inv-001', 'rcpt-001') },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
  });

  // Issue #381: there is no backend GET for an existing receipt (durion-positivity-backend#2214).
  // Arriving with a receiptId already in the route (deep link / reload) must not call a route
  // that does not exist — it renders a localized not-available state instead.
  it('renders a localized not-available state (not a network call) when a receiptId is already in the route', () => {
    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.NOT_AVAILABLE');
    expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
    expect(billingTransportStub.reprintReceipt).not.toHaveBeenCalled();

    expect(fixture.nativeElement.querySelector('[data-testid="receipt-not-available"]')).toBeTruthy();
  });

  it('recovers from the not-available state via reprint, which uses the receiptId already in the route', () => {
    billingTransportStub.reprintReceipt.mockReturnValue(of(receiptFixture));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const reprintBtn = fixture.nativeElement.querySelector('.receipt__reprint-btn');
    expect(reprintBtn).toBeTruthy();
    reprintBtn.click();
    fixture.detectChanges();

    expect(billingTransportStub.reprintReceipt).toHaveBeenCalledWith('inv-001', 'rcpt-001');
    expect(component.state()).toBe('ready');
    expect(component.receipt()).toEqual(receiptFixture);
  });

  it('sets idle state and makes no service calls when no receiptId is in the route', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ReceiptPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStubWith('inv-001', null) },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.state()).toBe('idle');
    expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
    expect(billingTransportStub.reprintReceipt).not.toHaveBeenCalled();
  });

  it('sets ready state and populates the receipt directly from generateReceipt(), with no follow-up load call (issue #381)', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ReceiptPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        // No receiptId in the route so ngOnInit leaves state 'idle' instead of pre-empting it.
        { provide: ActivatedRoute, useValue: routeStubWith('inv-001', null) },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();
    billingTransportStub.generateReceipt.mockReturnValue(of(receiptFixture));

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.generateAndShow({ deliveryMethod: 'PRINT' });

    expect(billingTransportStub.generateReceipt).toHaveBeenCalledWith('inv-001', { deliveryMethod: 'PRINT' });
    expect(component.state()).toBe('ready');
    expect(component.receipt()).toEqual(receiptFixture);
    expect(component.receiptId()).toBe('rcpt-001');
  });

  it('sets error state before errorKey when generateAndShow fails', () => {
    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

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
    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

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
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ReceiptPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: BillingTransportService, useValue: billingTransportStub },
        { provide: ActivatedRoute, useValue: routeStubWith(null, null) },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptPageComponent);
    component = fixture.componentInstance;
    // Do not call detectChanges — invoiceId remains '' (initial signal value)

    component.generateAndShow({ deliveryMethod: 'PRINT' });

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.MISSING_INVOICE');
    expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
  });

  describe('receiptId present but invoiceId missing', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ReceiptPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BillingTransportService, useValue: billingTransportStub },
          { provide: ActivatedRoute, useValue: routeStubWith('', 'rcpt-001') },
          { provide: AuthService, useValue: authStub },
        ],
      }).compileComponents();
    });

    it('sets error state when invoiceId is empty and receiptId is present, without calling the service', () => {
      fixture = TestBed.createComponent(ReceiptPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.MISSING_INVOICE');
      expect(billingTransportStub.generateReceipt).not.toHaveBeenCalled();
      expect(billingTransportStub.reprintReceipt).not.toHaveBeenCalled();
    });
  });

  describe('reprint needs no named permission (backend: authenticated below the cap)', () => {
    it('offers reprint to a user whose known permissions include no billing codes', async () => {
      TestBed.resetTestingModule();
      authStub.known = true;
      authStub.granted = [];
      await TestBed.configureTestingModule({
        imports: [ReceiptPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BillingTransportService, useValue: billingTransportStub },
          { provide: ActivatedRoute, useValue: routeStubWith('inv-001', 'rcpt-001') },
          { provide: AuthService, useValue: authStub },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ReceiptPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      billingTransportStub.reprintReceipt.mockReturnValue(of({ receiptId: 'rcpt-001', reference: 'R-1', status: 'ISSUED' }));
      component.reprint();
      expect(billingTransportStub.reprintReceipt).toHaveBeenCalledWith('inv-001', 'rcpt-001');
    });
  });

  describe('403 mapped to a localized permission error, not a frontend gate (Copilot #4106105999/#4106194893/#4106194936, durion-positivity-backend#2226)', () => {
    it('maps a 403 from generateAndShow to a localized permission error', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ReceiptPageComponent, TranslateModule.forRoot()],
        providers: [
          provideRouter([]),
          { provide: BillingTransportService, useValue: billingTransportStub },
          { provide: ActivatedRoute, useValue: routeStubWith('inv-001', null) },
          { provide: AuthService, useValue: authStub },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(ReceiptPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      billingTransportStub.generateReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );

      component.generateAndShow({ deliveryMethod: 'PRINT' });

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.GENERATE_PERMISSION_DENIED');
    });

    it('maps a 403 from reprint to a localized permission error', () => {
      fixture = TestBed.createComponent(ReceiptPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      billingTransportStub.reprintReceipt.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403 })),
      );

      component.reprint();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.REPRINT_PERMISSION_DENIED');
    });

    it('a non-403 failure from generateAndShow keeps the generic error key', () => {
      fixture = TestBed.createComponent(ReceiptPageComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      billingTransportStub.generateReceipt.mockReturnValue(throwError(() => new Error('boom')));

      component.generateAndShow({ deliveryMethod: 'PRINT' });

      expect(component.errorKey()).toBe('BILLING.RECEIPT.ERROR.GENERATE');
    });
  });
});
