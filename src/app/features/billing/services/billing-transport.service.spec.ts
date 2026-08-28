import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenerateReceiptRequest,
  InitiatePaymentRequestPaymentFlowEnum,
  InitiatePaymentResponse,
  InitiatePaymentResponseStatusEnum,
  InvoiceAdjustmentResponseTypeEnum,
  InvoiceDetailsResponse,
  InvoiceDetailsResponseStatusEnum,
  InvoiceSearchResultStatusEnum,
  InvoiceSearchService,
  InvoiceService,
  PageInvoiceSearchResult,
  PaymentReversalService,
  PaymentService,
  ReceiptResponse,
  ReceiptResponseStatusEnum,
  ReceiptService,
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
  };

  const paymentReversalServiceStub = {
    voidPayment: vi.fn(),
    refundPayment: vi.fn(),
  };

  const receiptServiceStub = {
    generateReceipt: vi.fn(),
    reprintReceipt: vi.fn(),
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

  it('loads invoice artifacts through the billing transport endpoint', () => {
    apiStub.get.mockReturnValueOnce(of([]));

    service.loadInvoiceArtifacts('inv-001').subscribe();

    expect(apiStub.get).toHaveBeenCalledWith('/invoice/v1/invoices/inv-001/artifacts');
  });

  it('elevates through the billing transport endpoint and emits the elevation token response', () => {
    const elevationResponse = { elevationToken: 'elev-001' };
    apiStub.post.mockReturnValueOnce(of(elevationResponse));

    let result: unknown;
    service.elevate('EMP-0001', 'inv-001').subscribe(value => {
      result = value;
    });

    expect(apiStub.post).toHaveBeenCalledWith('/invoice/v1/billing/auth/elevate', {
      managerEmployeeNumber: 'EMP-0001',
      invoiceId: 'inv-001',
    });
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

  it('keeps refund without an amount on the direct transport compatibility path', () => {
    apiStub.post.mockReturnValueOnce(of(undefined));

    service.executeRefund('inv-001', 'pay-001', 'DAMAGE', 'AUTH-REFUND').subscribe();

    expect(apiStub.post).toHaveBeenCalledWith(
      '/v1/billing/invoices/inv-001/payments/pay-001/refund',
      { reason: 'DAMAGE', authorityCode: 'AUTH-REFUND' },
    );
    expect(paymentReversalServiceStub.refundPayment).not.toHaveBeenCalled();
  });

  it('generates receipts through the receipt SDK client', () => {
    const receiptResponse: ReceiptResponse = {
      receiptId: 'rcpt-001',
      status: ReceiptResponseStatusEnum.Generated,
    };
    receiptServiceStub.generateReceipt.mockReturnValueOnce(of(receiptResponse));

    let result: unknown;
    service.generateReceipt('inv-001', { deliveryMethod: 'PRINT' }).subscribe(value => {
      result = value;
    });

    const expectedRequest: GenerateReceiptRequest = {
      paymentIntentId: 'PRINT',
      terminalId: 'WEB-UI',
      templateId: 'DEFAULT',
      templateVersion: '1',
    };
    expect(receiptServiceStub.generateReceipt).toHaveBeenCalledWith('inv-001', expectedRequest);
    expect(apiStub.post).not.toHaveBeenCalled();
    expect(result).toEqual({ receiptId: 'rcpt-001' });
  });

  it('creates artifact download tokens through the billing transport endpoint and emits the token response', () => {
    const tokenResponse = {
      downloadToken: 'token-001',
      downloadUrl: 'https://example.test/download/token-001',
      expiresAt: '2026-04-26T12:00:00Z',
    };
    apiStub.post.mockReturnValueOnce(of(tokenResponse));

    let result: unknown;
    service.createArtifactDownloadToken('inv-001', 'artifact-001').subscribe(value => {
      result = value;
    });

    expect(apiStub.post).toHaveBeenCalledWith(
      '/invoice/v1/invoices/inv-001/artifacts/artifact-001/download-token',
      {},
    );
    expect(receiptServiceStub.generateReceipt).not.toHaveBeenCalled();
    expect(result).toEqual(tokenResponse);
  });

  it('keeps receipt detail reads on the direct transport compatibility path', () => {
    apiStub.get.mockReturnValueOnce(of({ receiptId: 'rcpt-001', invoiceId: 'inv-001' }));

    service.loadReceipt('inv-001', 'rcpt-001').subscribe();

    expect(apiStub.get).toHaveBeenCalledWith('/v1/billing/invoices/inv-001/receipts/rcpt-001');
    expect(receiptServiceStub.generateReceipt).not.toHaveBeenCalled();
    expect(receiptServiceStub.reprintReceipt).not.toHaveBeenCalled();
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

    expect(invoiceSearchServiceStub.searchInvoices).toHaveBeenCalledWith('Acme', 0, 10);
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
