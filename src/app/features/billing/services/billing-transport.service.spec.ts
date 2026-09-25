import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BillingAuthorizationService,
  Configuration as InvoiceConfiguration,
  GenerateReceiptRequest,
  InitiatePaymentRequestPaymentFlowEnum,
  InitiatePaymentResponse,
  InitiatePaymentResponseStatusEnum,
  InvoiceAdjustmentResponseTypeEnum,
  InvoiceArtifactControllerService,
  InvoiceDetailsResponse,
  InvoiceDetailsResponseStatusEnum,
  InvoiceSearchResultStatusEnum,
  InvoiceSearchService,
  InvoiceService,
  PageInvoiceSearchResult,
  PaymentIntentResponse,
  PaymentIntentResponsePaymentFlowEnum,
  PaymentIntentResponseStatusEnum,
  PaymentReversalService,
  PaymentService,
  ReceiptResponse,
  ReceiptResponseStatusEnum,
  ReceiptService,
  ReceiptViewResponse,
  ReceiptViewResponseStatusEnum,
  RefundPaymentRequestReasonEnum,
  VoidPaymentRequestReasonEnum,
} from '@durion-sdk/invoice';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { BillingTransportService } from './billing-transport.service';

describe('BillingTransportService', () => {
  let service: BillingTransportService;

  const apiStub = {
    get: vi.fn(),
    post: vi.fn(),
  };

  const invoiceServiceStub = {
    getInvoice: vi.fn(),
    finalizeInvoice: vi.fn(),
  };

  const invoiceSearchServiceStub = {
    searchInvoices: vi.fn(),
  };

  // Translate the status key to its human label segment (e.g. BILLING.INVOICE_STATUS.DRAFT -> Draft).
  const translateStub = {
    instant: vi.fn((key: string) => {
      const seg = key.split('.').pop() ?? key;
      return seg.charAt(0) + seg.slice(1).toLowerCase();
    }),
  };

  const paymentServiceStub = {
    initiatePayment: vi.fn(),
    capturePayment: vi.fn(),
    getInvoicePayment: vi.fn(),
    listInvoicePayments: vi.fn(),
  };

  const paymentReversalServiceStub = {
    voidPayment: vi.fn(),
    refundPayment: vi.fn(),
  };

  const receiptServiceStub = {
    generateReceipt: vi.fn(),
    reprintReceipt: vi.fn(),
    getReceipt: vi.fn(),
  };

  const invoiceArtifactServiceStub = {
    listInvoiceArtifacts: vi.fn(),
    createArtifactDownloadToken: vi.fn(),
  };

  const billingAuthorizationServiceStub = {
    elevateManagerApproval: vi.fn(),
  };

  const invoiceResponse: InvoiceDetailsResponse = {
    invoiceId: 'inv-001',
    invoiceNumber: 'INV-001',
    workorderId: 'wo-001',
    workorderNumber: 'WO-2026-1001',
    requiresManagerApproval: true,
    status: InvoiceDetailsResponseStatusEnum.Finalized,
    subtotal: 100,
    tax: 8,
    adjustments: 5,
    total: 113,
    items: [
      {
        id: 'item-1',
        description: 'Labor',
        quantity: 1,
        unitPrice: 100,
        amount: 100,
        type: 'LABOR',
      },
    ],
    adjustmentEntries: [
      {
        id: 'adj-1',
        reason: 'MANAGER_OVERRIDE',
        type: InvoiceAdjustmentResponseTypeEnum.Discount,
        amount: 5,
        authorizedBy: 'manager-1',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        BillingTransportService,
        { provide: ApiBaseService, useValue: apiStub },
        { provide: InvoiceService, useValue: invoiceServiceStub },
        { provide: InvoiceSearchService, useValue: invoiceSearchServiceStub },
        { provide: TranslateService, useValue: translateStub },
        { provide: PaymentService, useValue: paymentServiceStub },
        { provide: PaymentReversalService, useValue: paymentReversalServiceStub },
        { provide: ReceiptService, useValue: receiptServiceStub },
        { provide: InvoiceArtifactControllerService, useValue: invoiceArtifactServiceStub },
        { provide: BillingAuthorizationService, useValue: billingAuthorizationServiceStub },
        { provide: InvoiceConfiguration, useValue: { basePath: '/api/invoice' } },
      ],
    });
    service = TestBed.inject(BillingTransportService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('loads invoice detail through the invoice SDK and maps it into the frontend model', () => {
    invoiceServiceStub.getInvoice.mockReturnValueOnce(of(invoiceResponse));

    let result: unknown;
    service.loadInvoiceDetail('inv-001').subscribe(value => {
      result = value;
    });

    expect(invoiceServiceStub.getInvoice).toHaveBeenCalledWith('inv-001');
    expect(apiStub.get).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      invoiceId: 'inv-001',
      workOrderId: 'wo-001',
      workOrderNumber: 'WO-2026-1001',
      status: 'FINALIZED',
      taxAmount: 8,
      adjustmentTotal: 5,
      grandTotal: 113,
    }));
    expect((result as { issuancePolicy?: { requiresElevation?: boolean } }).issuancePolicy?.requiresElevation).toBe(true);
    expect((result as { lineItems?: { type?: string }[] }).lineItems?.[0]?.type).toBe('LABOR');
  });

  it('preserves a non-draft/non-finalized status instead of coercing it to DRAFT', () => {
    invoiceServiceStub.getInvoice.mockReturnValueOnce(
      of({ ...invoiceResponse, status: InvoiceDetailsResponseStatusEnum.Posted }),
    );

    let result: unknown;
    service.loadInvoiceDetail('inv-001').subscribe(value => {
      result = value;
    });

    expect((result as { status?: string }).status).toBe('POSTED');
  });

  it('finalizes an invoice through the invoice SDK with the manager approval code mapping', () => {
    invoiceServiceStub.finalizeInvoice.mockReturnValueOnce(of(invoiceResponse));

    let result: unknown;
    service.issueInvoice('inv-001', { elevationToken: 'mgr-approval' }).subscribe(value => {
      result = value;
    });

    expect(invoiceServiceStub.finalizeInvoice).toHaveBeenCalledWith('inv-001', {
      managerApprovalCode: 'mgr-approval',
    });
    expect(apiStub.post).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ invoiceId: 'inv-001', status: 'FINALIZED' }));
  });

  it('loads invoice artifacts through the invoice artifact SDK and maps them into the frontend model', () => {
    invoiceArtifactServiceStub.listInvoiceArtifacts.mockReturnValueOnce(of([
      {
        artifactRefId: 'artifact-001',
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        createdAt: '2026-04-26T12:00:00Z',
      },
    ]));

    let result: unknown;
    service.loadInvoiceArtifacts('inv-001').subscribe(value => {
      result = value;
    });

    expect(invoiceArtifactServiceStub.listInvoiceArtifacts).toHaveBeenCalledWith('inv-001');
    expect(apiStub.get).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        artifactRefId: 'artifact-001',
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        createdAt: '2026-04-26T12:00:00Z',
      },
    ]);
  });

  it('elevates through the billing authorization SDK and emits the elevation token response', () => {
    const elevationResponse = { elevationToken: 'elev-001', expiresAt: '2026-04-26T12:05:00Z' };
    billingAuthorizationServiceStub.elevateManagerApproval.mockReturnValueOnce(of(elevationResponse));

    let result: unknown;
    service.elevate('EMP-0001', 'inv-001').subscribe(value => {
      result = value;
    });

    expect(billingAuthorizationServiceStub.elevateManagerApproval).toHaveBeenCalledWith({
      managerEmployeeNumber: 'EMP-0001',
      invoiceId: 'inv-001',
    });
    expect(apiStub.post).not.toHaveBeenCalled();
    expect(invoiceServiceStub.finalizeInvoice).not.toHaveBeenCalled();
    expect(result).toEqual(elevationResponse);
  });

  it('initiates and captures payment through the payment SDK clients', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-1111-1111-111111111111')
      .mockReturnValueOnce('22222222-2222-2222-2222-222222222222');

    const initiateResponse: InitiatePaymentResponse = {
      paymentIntentId: 'pay-001',
      status: InitiatePaymentResponseStatusEnum.Pending,
      authorizedAmount: 150,
      gatewayProvider: 'stripe',
    };
    const capturedResponse: InitiatePaymentResponse = {
      paymentIntentId: 'pay-001',
      status: InitiatePaymentResponseStatusEnum.Captured,
      capturedAmount: 150,
      gatewayProvider: 'stripe',
    };

    paymentServiceStub.initiatePayment.mockReturnValueOnce(of(initiateResponse));
    paymentServiceStub.capturePayment.mockReturnValueOnce(of(capturedResponse));

    let result: unknown;
    service.initiateAndCapturePayment('inv-001', 'CARD', 150).subscribe(value => {
      result = value;
    });

    expect(paymentServiceStub.initiatePayment).toHaveBeenCalledWith('inv-001', {
      paymentFlow: InitiatePaymentRequestPaymentFlowEnum.SaleCapture,
      amount: 150,
      idempotencyKey: '11111111-1111-1111-1111-111111111111',
      paymentToken: 'UI-CARD',
    });
    expect(paymentServiceStub.capturePayment).toHaveBeenCalledWith('inv-001', 'pay-001', {
      amount: 150,
      captureIdempotencyKey: '22222222-2222-2222-2222-222222222222',
    });
    expect(apiStub.post).not.toHaveBeenCalled();
    expect(result).toEqual({
      paymentId: 'pay-001',
      invoiceId: 'inv-001',
      transactionId: 'pay-001',
      authCode: 'stripe',
      status: 'CAPTURED',
      amount: 150,
      currency: 'USD',
    });
  });

  it('voids payment through the payment reversal SDK with mapped reason and notes', () => {
    paymentReversalServiceStub.voidPayment.mockReturnValueOnce(of(undefined));

    let result: unknown;
    service.executeVoid('inv-001', 'pay-001', 'CUSTOMER_REQUEST', 'AUTH-VOID').subscribe(value => {
      result = value;
    });

    expect(paymentReversalServiceStub.voidPayment).toHaveBeenCalledWith('inv-001', 'pay-001', {
      reason: VoidPaymentRequestReasonEnum.CustomerRequest,
      notes: 'AUTH-VOID',
    });
    expect(apiStub.post).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('refunds payment with an explicit amount through the payment reversal SDK', () => {
    paymentReversalServiceStub.refundPayment.mockReturnValueOnce(of({}));

    let result: unknown;
    service.executeRefund('inv-001', 'pay-001', 'DAMAGE', 'AUTH-REFUND', 42.5).subscribe(value => {
      result = value;
    });

    expect(paymentReversalServiceStub.refundPayment).toHaveBeenCalledWith('inv-001', 'pay-001', {
      amount: 42.5,
      reason: RefundPaymentRequestReasonEnum.DamagedGoods,
      notes: 'AUTH-REFUND',
    });
    expect(apiStub.post).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  describe('loadRefundContext (durion-positivity-backend#2226: getInvoicePayment)', () => {
    const paymentIntent = (overrides: Partial<PaymentIntentResponse>): PaymentIntentResponse => ({
      paymentId: 'pay-001',
      invoiceId: 'inv-001',
      paymentFlow: PaymentIntentResponsePaymentFlowEnum.SaleCapture,
      status: PaymentIntentResponseStatusEnum.Captured,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
      capturedAmount: 100,
      refundedAmount: 20,
      refundableAmount: 80,
      ...overrides,
    });

    it('reads captured/refunded/refundable amounts from getInvoicePayment, not listInvoiceRefunds', () => {
      paymentServiceStub.getInvoicePayment.mockReturnValueOnce(of(paymentIntent({})));

      let result: unknown;
      service.loadRefundContext('inv-001', 'pay-001').subscribe(value => {
        result = value;
      });

      expect(paymentServiceStub.getInvoicePayment).toHaveBeenCalledWith('inv-001', 'pay-001');
      expect(invoiceServiceStub.getInvoice).not.toHaveBeenCalled();
      expect(result).toEqual({
        capturedAmount: 100,
        refundedAmount: 20,
        refundableAmount: 80,
        status: 'CAPTURED',
      });
    });

    it('passes refundableAmount through as null when the intent is not CAPTURED', () => {
      paymentServiceStub.getInvoicePayment.mockReturnValueOnce(of(paymentIntent({
        status: PaymentIntentResponseStatusEnum.Authorized,
        capturedAmount: undefined,
        refundedAmount: undefined,
        refundableAmount: undefined,
      })));

      let result: { refundableAmount: number | null; status: string } | undefined;
      service.loadRefundContext('inv-001', 'pay-001').subscribe(value => {
        result = value;
      });

      expect(result?.refundableAmount).toBeNull();
      expect(result?.status).toBe('AUTHORIZED');
    });
  });

  describe('generateReceipt (issue #381 bug fix: real payment-intent id, not the delivery selection)', () => {
    const capturedPayment = (overrides: Partial<PaymentIntentResponse>): PaymentIntentResponse => ({
      paymentId: 'pay-001',
      invoiceId: 'inv-001',
      paymentFlow: PaymentIntentResponsePaymentFlowEnum.SaleCapture,
      status: PaymentIntentResponseStatusEnum.Captured,
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
      ...overrides,
    });

    it('resolves the real payment-intent id from listInvoicePayments and never sends the delivery selection as paymentIntentId', () => {
      const receiptResponse: ReceiptResponse = {
        receiptId: 'rcpt-001',
        reference: 'R-1001',
        status: ReceiptResponseStatusEnum.Generated,
      };
      paymentServiceStub.listInvoicePayments.mockReturnValueOnce(of([capturedPayment({ paymentId: 'pay-001' })]));
      receiptServiceStub.generateReceipt.mockReturnValueOnce(of(receiptResponse));

      let result: unknown;
      service.generateReceipt('inv-001', { deliveryMethod: 'PRINT' }).subscribe(value => {
        result = value;
      });

      expect(paymentServiceStub.listInvoicePayments).toHaveBeenCalledWith('inv-001');
      const expectedRequest: GenerateReceiptRequest = {
        paymentIntentId: 'pay-001',
        terminalId: 'WEB-UI',
        templateId: 'DEFAULT',
        templateVersion: '1',
      };
      expect(receiptServiceStub.generateReceipt).toHaveBeenCalledWith('inv-001', expectedRequest);
      expect(apiStub.post).not.toHaveBeenCalled();
      expect(apiStub.get).not.toHaveBeenCalled();
      expect(result).toEqual({ receiptId: 'rcpt-001', invoiceId: 'inv-001', receiptNumber: 'R-1001' });
    });

    it('prefers the most recently updated CAPTURED intent when an invoice has more than one', () => {
      receiptServiceStub.generateReceipt.mockReturnValueOnce(of({ receiptId: 'rcpt-001', status: ReceiptResponseStatusEnum.Generated }));
      paymentServiceStub.listInvoicePayments.mockReturnValueOnce(of([
        capturedPayment({ paymentId: 'pay-old', updatedAt: '2026-01-01T00:00:00Z' }),
        capturedPayment({ paymentId: 'pay-new', updatedAt: '2026-03-01T00:00:00Z' }),
        capturedPayment({ paymentId: 'pay-voided', status: PaymentIntentResponseStatusEnum.Voided, updatedAt: '2026-04-01T00:00:00Z' }),
      ]));

      service.generateReceipt('inv-001', {}).subscribe();

      expect(receiptServiceStub.generateReceipt).toHaveBeenCalledWith(
        'inv-001',
        expect.objectContaining({ paymentIntentId: 'pay-new' }),
      );
    });

    it('errors without calling generateReceipt when no CAPTURED payment intent exists for the invoice', () => {
      paymentServiceStub.listInvoicePayments.mockReturnValueOnce(of([
        capturedPayment({ paymentId: 'pay-auth', status: PaymentIntentResponseStatusEnum.Authorized }),
      ]));

      let error: unknown;
      service.generateReceipt('inv-001', {}).subscribe({ error: err => { error = err; } });

      expect(error).toBeInstanceOf(Error);
      expect(receiptServiceStub.generateReceipt).not.toHaveBeenCalled();
    });
  });

  describe('loadReceipt (durion-positivity-backend#2214: getReceipt)', () => {
    it('loads a receipt read-only through ReceiptService.getReceipt and maps card-brand-free detail', () => {
      const viewResponse: ReceiptViewResponse = {
        receiptId: 'rcpt-001',
        invoiceId: 'inv-001',
        paymentIntentId: 'pay-001',
        reference: 'R-1001',
        status: ReceiptViewResponseStatusEnum.Generated,
        paidAmount: 42.5,
        paymentMethod: 'stripe',
        cashierId: 'cashier-1',
        terminalId: 'WEB-UI',
        reprintCount: 2,
        templateId: 'DEFAULT',
        templateVersion: '1',
        createdAt: '2026-03-01T00:00:00Z',
      };
      receiptServiceStub.getReceipt.mockReturnValueOnce(of(viewResponse));

      let result: unknown;
      service.loadReceipt('inv-001', 'rcpt-001').subscribe(value => {
        result = value;
      });

      expect(receiptServiceStub.getReceipt).toHaveBeenCalledWith('inv-001', 'rcpt-001');
      expect(result).toEqual(expect.objectContaining({
        receiptId: 'rcpt-001',
        invoiceId: 'inv-001',
        paymentId: 'pay-001',
        receiptNumber: 'R-1001',
        status: 'GENERATED',
        paidAmount: 42.5,
        paymentMethod: 'stripe',
        cashierId: 'cashier-1',
        terminalId: 'WEB-UI',
        reprintCount: 2,
      }));
    });
  });

  it('creates artifact download tokens through the invoice artifact SDK and maps the token response', () => {
    const tokenResponse = {
      downloadToken: 'token-001',
      expiresAt: '2026-04-26T12:00:00Z',
    };
    invoiceArtifactServiceStub.createArtifactDownloadToken.mockReturnValueOnce(of(tokenResponse));

    let result: unknown;
    service.createArtifactDownloadToken('inv-001', 'artifact-001').subscribe(value => {
      result = value;
    });

    expect(invoiceArtifactServiceStub.createArtifactDownloadToken).toHaveBeenCalledWith('inv-001', 'artifact-001');
    expect(apiStub.post).not.toHaveBeenCalled();
    expect(receiptServiceStub.generateReceipt).not.toHaveBeenCalled();
    expect(result).toEqual(tokenResponse);
  });

  describe('resolveArtifactDownloadUrl()', () => {
    it('prefers the server-issued downloadUrl over building one', () => {
      const url = service.resolveArtifactDownloadUrl('inv-001', 'artifact-001', {
        downloadToken: 'token-001',
        downloadUrl: 'https://example.test/download/token-001',
      });

      expect(url).toBe('https://example.test/download/token-001');
    });

    it('falls back to a URL built from the injected InvoiceConfiguration basePath, not environment.apiBaseUrl (issue #350)', () => {
      const url = service.resolveArtifactDownloadUrl('inv-001', 'artifact-001', {
        downloadToken: 'token-001',
      });

      expect(url).toBe('/api/invoice/v1/invoices/inv-001/artifacts/artifact-001/download?token=token-001');
    });
  });

  it('reprints receipts through the receipt SDK client and maps the response', () => {
    const receiptResponse: ReceiptResponse = {
      receiptId: 'rcpt-001',
      reference: 'R-1001',
      status: ReceiptResponseStatusEnum.Generated,
    };
    receiptServiceStub.reprintReceipt.mockReturnValueOnce(of(receiptResponse));

    let result: unknown;
    service.reprintReceipt('inv-001', 'rcpt-001').subscribe(value => {
      result = value;
    });

    expect(receiptServiceStub.reprintReceipt).toHaveBeenCalledWith('inv-001', 'rcpt-001', {
      reason: 'CUSTOMER_REQUEST',
    });
    expect(apiStub.post).not.toHaveBeenCalled();
    expect(result).toEqual({
      receiptId: 'rcpt-001',
      invoiceId: 'inv-001',
      receiptNumber: 'R-1001',
    });
  });

  it('searchInvoices maps search results to finder items', () => {
    const page: PageInvoiceSearchResult = {
      content: [
        {
          invoiceId: 'inv-001',
          invoiceNumber: 'INV-001',
          customerName: 'Acme Towing LLC',
          workorderId: 'wo-001',
          workorderNumber: 'WO-2026-1001',
          status: InvoiceSearchResultStatusEnum.Draft,
          total: 113,
        },
      ],
    };
    invoiceSearchServiceStub.searchInvoices.mockReturnValue(of(page));

    let result: unknown;
    service.searchInvoices('Acme').subscribe(value => {
      result = value;
    });

    expect(invoiceSearchServiceStub.searchInvoices).toHaveBeenCalledWith(
      'Acme',
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      10,
    );
    expect(result).toEqual([
      {
        id: 'inv-001',
        primary: 'Acme Towing LLC',
        secondary: 'INV-001 · Draft',
        tertiary: 'WO-2026-1001',
      },
    ]);
  });

  it('searchInvoices falls back to invoice number when customer name is absent', () => {
    const page: PageInvoiceSearchResult = {
      content: [
        {
          invoiceId: 'inv-002',
          invoiceNumber: 'INV-002',
          status: InvoiceSearchResultStatusEnum.Finalized,
        },
      ],
    };
    invoiceSearchServiceStub.searchInvoices.mockReturnValue(of(page));

    let result: unknown;
    service.searchInvoices('INV-002').subscribe(value => {
      result = value;
    });

    expect(result).toEqual([
      {
        id: 'inv-002',
        primary: 'INV-002',
        secondary: 'INV-002 · Finalized',
        tertiary: undefined,
      },
    ]);
  });
});
