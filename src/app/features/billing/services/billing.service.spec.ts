import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import {
  CapturePaymentRequest,
  GenerateReceiptRequest,
  InitiatePaymentRequest,
  PaymentActionResult,
  PaymentTransactionRef,
  ReceiptRef,
  RefundPaymentRequest,
  VoidPaymentRequest,
} from '../models/billing.models';
import { BillingService } from './billing.service';

const BASE = environment.apiBaseUrl;

describe('BillingService CAP-250', () => {
  let service: BillingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BillingService, ApiBaseService],
    });

    service = TestBed.inject(BillingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('initiatePayment posts to /v1/billing/invoices/{invoiceId}/payments', () => {
    const request: InitiatePaymentRequest = {
      paymentMethod: 'CARD',
      amount: 125,
      currency: 'USD',
      paymentTokenRef: 'tok-1',
      authorityCode: 'AUTH-PAY',
      idempotencyKey: 'idem-1',
    };

    const fixture: PaymentTransactionRef = {
      paymentId: 'pay-1',
      invoiceId: 'inv-1',
      transactionId: 'txn-1',
      authCode: 'AUTH-1',
      status: 'AUTHORIZED',
      amount: 125,
      currency: 'USD',
      createdAt: '2026-03-30T12:00:00Z',
    };
    let result: PaymentTransactionRef | undefined;

    service.initiatePayment('inv-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/billing/invoices/inv-1/payments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('capturePayment posts to /v1/billing/invoices/{invoiceId}/payments/{paymentId}/capture', () => {
    const request: CapturePaymentRequest = { authorityCode: 'AUTH-CAP' };
    const fixture: PaymentTransactionRef = {
      paymentId: 'pay-1',
      invoiceId: 'inv-1',
      transactionId: 'txn-1',
      authCode: 'AUTH-CAP',
      status: 'CAPTURED',
      amount: 125,
      currency: 'USD',
      createdAt: '2026-03-30T12:00:00Z',
      capturedAt: '2026-03-30T12:01:00Z',
    };
    let result: PaymentTransactionRef | undefined;

    service.capturePayment('inv-1', 'pay-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/billing/invoices/inv-1/payments/pay-1/capture`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('voidPayment posts to /v1/billing/invoices/{invoiceId}/payments/{paymentId}/void', () => {
    const request: VoidPaymentRequest = { reason: 'CUSTOMER_REQUEST', authorityCode: 'AUTH-VOID' };
    const fixture: PaymentActionResult = {
      paymentId: 'pay-1',
      invoiceId: 'inv-1',
      status: 'VOIDED',
      actionAt: '2026-03-30T12:03:00Z',
    };
    let result: PaymentActionResult | undefined;

    service.voidPayment('inv-1', 'pay-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/billing/invoices/inv-1/payments/pay-1/void`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('refundPayment posts to /v1/billing/invoices/{invoiceId}/payments/{paymentId}/refund', () => {
    const request: RefundPaymentRequest = {
      reason: 'SERVICE_ISSUE',
      authorityCode: 'AUTH-REFUND',
      amount: 50,
    };

    const fixture: PaymentActionResult = {
      paymentId: 'pay-1',
      invoiceId: 'inv-1',
      status: 'REFUNDED',
      actionAt: '2026-03-30T12:04:00Z',
    };
    let result: PaymentActionResult | undefined;

    service.refundPayment('inv-1', 'pay-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/billing/invoices/inv-1/payments/pay-1/refund`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('generateReceipt posts to /v1/billing/invoices/{invoiceId}/receipts', () => {
    const request: GenerateReceiptRequest = {
      deliveryMethod: 'EMAIL',
      emailAddress: 'cashier@example.com',
    };

    const fixture: ReceiptRef = {
      receiptId: 'rcpt-1',
      invoiceId: 'inv-1',
      paymentId: 'pay-1',
      receiptNumber: 'R-1001',
      generatedAt: '2026-03-30T12:05:00Z',
      emailedTo: 'cashier@example.com',
      pdfUrl: 'https://example.test/r/R-1001.pdf',
    };
    let result: ReceiptRef | undefined;

    service.generateReceipt('inv-1', request).subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/billing/invoices/inv-1/receipts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('getReceipt gets /v1/billing/invoices/{invoiceId}/receipts/{receiptId}', () => {
    const fixture: ReceiptRef = {
      receiptId: 'rcpt-1',
      invoiceId: 'inv-1',
      paymentId: 'pay-1',
      receiptNumber: 'R-1001',
      generatedAt: '2026-03-30T12:05:00Z',
      pdfUrl: 'https://example.test/r/R-1001.pdf',
    };
    let result: ReceiptRef | undefined;

    service.getReceipt('inv-1', 'rcpt-1').subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/billing/invoices/inv-1/receipts/rcpt-1`);
    expect(req.request.method).toBe('GET');
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });

  it('reprintReceipt posts to /v1/billing/invoices/{invoiceId}/receipts/{receiptId}/reprint', () => {
    const fixture: ReceiptRef = {
      receiptId: 'rcpt-1',
      invoiceId: 'inv-1',
      paymentId: 'pay-1',
      receiptNumber: 'R-1001',
      generatedAt: '2026-03-30T12:05:00Z',
      pdfUrl: 'https://example.test/r/R-1001.pdf',
    };
    let result: ReceiptRef | undefined;

    service.reprintReceipt('inv-1', 'rcpt-1').subscribe(value => {
      result = value;
    });

    const req = http.expectOne(`${BASE}/v1/billing/invoices/inv-1/receipts/rcpt-1/reprint`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(fixture);
    expect(result).toEqual(fixture);
  });
});
