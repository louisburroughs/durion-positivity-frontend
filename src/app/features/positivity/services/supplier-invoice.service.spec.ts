/**
 * SupplierInvoiceService contract tests (issue #192).
 *
 * ADR-0035: every public method asserts verb + URL.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierInvoiceService } from './supplier-invoice.service';
import {
  SupplierInvoiceDetail,
  SupplierInvoicePage,
  SupplierInvoiceSummary,
} from '../models/supplier-invoice.models';

const BASE = environment.apiBaseUrl;
const INVOICES_URL = `${BASE}/supplier/v1/vendor-invoices`;
const EXCEPTIONS_URL = `${INVOICES_URL}/exceptions`;
const INVOICE_ID = 'aa11bb22-0000-7000-8000-000000000001';

const summaryFixture: SupplierInvoiceSummary = {
  invoiceId: INVOICE_ID,
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  invoiceNumber: 'MX-INV-88213',
  issueDate: '2026-08-04',
  type: 'INVOICE',
  amount: '4820.75',
  currency: 'EUR',
  voucherReference: 'VCH-2026-0912',
  voucherStatus: 'LINKED',
  flags: [],
  fetchedAt: '2026-08-12T12:00:00Z',
};

const creditNoteFixture: SupplierInvoiceSummary = {
  invoiceId: 'aa11bb22-0000-7000-8000-000000000002',
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  invoiceNumber: 'MX-CN-1187',
  issueDate: '2026-08-06',
  type: 'CREDIT_NOTE',
  amount: '-980.00',
  currency: 'EUR',
  voucherReference: null,
  voucherStatus: 'PENDING',
  flags: ['UNMATCHED'],
  fetchedAt: '2026-08-12T12:00:00Z',
};

const pageFixture: SupplierInvoicePage = {
  items: [summaryFixture, creditNoteFixture],
  totalCount: 2,
  nextPageToken: null,
};

const detailFixture: SupplierInvoiceDetail = {
  ...summaryFixture,
  flags: ['DISCREPANCY'],
  lines: [
    {
      lineId: 'ln-1',
      vendorLineReference: 'L001',
      sku: 'MX-2255',
      description: 'Primacy 4 225/55R17',
      quantity: '8',
      unitOfMeasure: 'EA',
      unitAmount: '602.594',
      lineAmount: '4820.75',
      currency: 'EUR',
    },
  ],
  purchaseOrderId: 'po-uuid-1',
  poNumber: 'PO-1042',
  versions: [
    {
      versionRef: 'v1',
      invoiceNumber: 'MX-INV-88213',
      issueDate: '2026-08-04',
      amount: '4820.75',
      currency: 'EUR',
      receivedAt: '2026-08-05T08:00:00Z',
      current: false,
    },
    {
      versionRef: 'v2',
      invoiceNumber: 'MX-INV-88213-R',
      issueDate: '2026-08-09',
      amount: '5120.75',
      currency: 'EUR',
      receivedAt: '2026-08-10T08:00:00Z',
      current: true,
    },
  ],
  exceptionDetail: 'Re-issued with revised freight surcharge.',
  asOf: '2026-08-10T08:00:00Z',
  stalenessThresholdMinutes: 1440,
};

describe('SupplierInvoiceService', () => {
  let service: SupplierInvoiceService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierInvoiceService, ApiBaseService],
    });
    service = TestBed.inject(SupplierInvoiceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('listInvoices() — GET /supplier/v1/vendor-invoices with no params by default', () => {
    let received: SupplierInvoicePage | undefined;
    service.listInvoices().subscribe(v => (received = v));

    const req = http.expectOne(r => r.url === INVOICES_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toHaveLength(0);
    req.flush(pageFixture);

    expect(received?.items).toHaveLength(2);
  });

  it('listInvoices() — forwards vendor, search, type, flag, date and page filters', () => {
    service
      .listInvoices(
        {
          vendorProfileId: 'vp-1',
          search: 'MX-INV',
          type: 'CREDIT_NOTE',
          flag: 'DISCREPANCY',
          dateFrom: '2026-08-01',
          dateTo: '2026-08-12',
        },
        'tok-2',
      )
      .subscribe();

    const req = http.expectOne(r => r.url === INVOICES_URL);
    expect(req.request.params.get('vendorProfileId')).toBe('vp-1');
    expect(req.request.params.get('search')).toBe('MX-INV');
    expect(req.request.params.get('type')).toBe('CREDIT_NOTE');
    expect(req.request.params.get('flag')).toBe('DISCREPANCY');
    expect(req.request.params.get('dateFrom')).toBe('2026-08-01');
    expect(req.request.params.get('dateTo')).toBe('2026-08-12');
    expect(req.request.params.get('pageToken')).toBe('tok-2');
    req.flush(pageFixture);
  });

  it('listExceptions() — GET the dedicated exception worklist endpoint', () => {
    service.listExceptions({ vendorProfileId: 'vp-1' }).subscribe();

    const req = http.expectOne(r => r.url === EXCEPTIONS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('vendorProfileId')).toBe('vp-1');
    req.flush({ items: [creditNoteFixture], totalCount: 1, nextPageToken: null });
  });

  it('getInvoice() — GET /supplier/v1/vendor-invoices/{invoiceId}', () => {
    let received: SupplierInvoiceDetail | undefined;
    service.getInvoice(INVOICE_ID).subscribe(v => (received = v));

    const req = http.expectOne(r => r.url === `${INVOICES_URL}/${INVOICE_ID}`);
    expect(req.request.method).toBe('GET');
    req.flush(detailFixture);

    expect(received?.poNumber).toBe('PO-1042');
    expect(received?.versions).toHaveLength(2);
  });

  it('passes amounts through as delivered decimal text — no parsing, no rounding', () => {
    let received: SupplierInvoicePage | undefined;
    service.listInvoices().subscribe(v => (received = v));
    http.expectOne(r => r.url === INVOICES_URL).flush(pageFixture);

    expect(received?.items[0].amount).toBe('4820.75');
    expect(received?.items[1].amount).toBe('-980.00');
    expect(typeof received?.items[1].amount).toBe('string');
  });

  it('delivers both versions of a DISCREPANCY without merging them', () => {
    let received: SupplierInvoiceDetail | undefined;
    service.getInvoice(INVOICE_ID).subscribe(v => (received = v));
    http.expectOne(r => r.url === `${INVOICES_URL}/${INVOICE_ID}`).flush(detailFixture);

    expect(received?.versions.map(v => v.versionRef)).toEqual(['v1', 'v2']);
    expect(received?.versions.map(v => v.amount)).toEqual(['4820.75', '5120.75']);
  });

  it('propagates a 403 rather than masking it as an empty list', () => {
    let status = 0;
    service.listInvoices().subscribe({
      error: (err: { status: number }) => (status = err.status),
    });

    http
      .expectOne(r => r.url === INVOICES_URL)
      .flush({ message: 'nope' }, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
  });

  // #192 §6 — "no mutating calls in this story"; §8 ruled review-only in v1.
  // A client-side acknowledgment would let a flagged row leave the worklist
  // while the underlying mismatch is still live, so the absence is asserted
  // rather than merely intended.
  it('exposes no mutating operation at all — the absence is the safety property', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      name => name !== 'constructor',
    );

    expect(
      methodNames.filter(name =>
        /create|update|delete|remove|post|put|patch|save|submit|resolve|acknowledge|ack|dismiss|clear|approve|reject|match|link|unlink/i.test(
          name,
        ),
      ),
    ).toEqual([]);
    expect(methodNames.every(name => /^(list|get)/.test(name))).toBe(true);
  });

  it('issues only GET requests across its whole surface', () => {
    service.listInvoices().subscribe();
    service.listExceptions().subscribe();
    service.getInvoice(INVOICE_ID).subscribe();

    const requests = [
      ...http.match(r => r.url === INVOICES_URL),
      ...http.match(r => r.url === EXCEPTIONS_URL),
      ...http.match(r => r.url === `${INVOICES_URL}/${INVOICE_ID}`),
    ];
    expect(requests).toHaveLength(3);
    expect(requests.every(r => r.request.method === 'GET')).toBe(true);
    requests.forEach(r => r.flush(pageFixture));
  });
});
