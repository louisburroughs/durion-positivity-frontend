/**
 * Ingested vendor invoice detail (issue #192).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 * ADR-0037: in-app navigation is asserted as a real `routerLink` href.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VendorInvoiceDetailPageComponent } from './vendor-invoice-detail-page.component';
import { SupplierInvoiceService } from '../../services/supplier-invoice.service';
import { SupplierInvoiceDetail } from '../../models/supplier-invoice.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const INVOICE_ID = 'inv-1';

const baseDetail: SupplierInvoiceDetail = {
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
  fetchedAt: '2026-08-12T11:59:00Z',
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
  versions: [],
  exceptionDetail: null,
  asOf: '2026-08-12T11:40:00Z',
  stalenessThresholdMinutes: 1440,
};

const creditNoteDetail: SupplierInvoiceDetail = {
  ...baseDetail,
  invoiceId: 'inv-2',
  invoiceNumber: 'MX-CN-1187',
  type: 'CREDIT_NOTE',
  amount: '-980.00',
  lines: [
    {
      lineId: 'ln-c1',
      sku: 'MX-2255',
      description: 'Return credit — Primacy 4 225/55R17',
      quantity: '2',
      unitOfMeasure: 'EA',
      unitAmount: '-490.00',
      lineAmount: '-980.00',
      currency: 'EUR',
    },
  ],
};

const unmatchedDetail: SupplierInvoiceDetail = {
  ...baseDetail,
  flags: ['UNMATCHED'],
  purchaseOrderId: null,
  poNumber: null,
  voucherReference: null,
  voucherStatus: 'PENDING',
  exceptionDetail: 'No purchase order carries vendor order number MX-ORD-99182.',
};

const discrepancyDetail: SupplierInvoiceDetail = {
  ...baseDetail,
  flags: ['DISCREPANCY'],
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
};

describe('VendorInvoiceDetailPageComponent', () => {
  let fixture: ComponentFixture<VendorInvoiceDetailPageComponent>;
  let component: VendorInvoiceDetailPageComponent;

  const service = {
    listInvoices: vi.fn(),
    listExceptions: vi.fn(),
    getInvoice: vi.fn(),
  };

  async function setup(detail: SupplierInvoiceDetail | HttpErrorResponse = baseDetail): Promise<HTMLElement> {
    service.getInvoice.mockReturnValue(
      detail instanceof HttpErrorResponse ? throwError(() => detail) : of(detail),
    );

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VendorInvoiceDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierInvoiceService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(convertToParamMap({ invoiceId: INVOICE_ID })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorInvoiceDetailPageComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('nowMs', NOW);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the invoice named by the route', async () => {
    await setup();

    expect(service.getInvoice).toHaveBeenCalledWith(INVOICE_ID);
    expect(component.state()).toBe('ready');
  });

  it('renders line data exactly as delivered — no re-derived line totals', async () => {
    const el = await setup();

    const cells = Array.from(el.querySelectorAll('.invoice-detail__lines tbody td')).map(n =>
      n.textContent?.trim(),
    );
    // 8 × 602.594 is 4820.752, not the delivered 4820.75. The screen shows both
    // delivered figures untouched and computes neither from the other.
    expect(cells.join(' ')).toContain('602.594');
    expect(cells.join(' ')).toContain('4820.75');
    expect(cells.join(' ')).not.toContain('4820.752');
  });

  it('applies no CurrencyPipe — the delivered code is shown, never a substituted symbol', async () => {
    const el = await setup();

    expect(el.textContent).toContain('EUR');
    expect(el.textContent).not.toContain('€');
    expect(el.textContent).not.toContain('$');
  });

  it('renders a credit note negative at every level and never coerces it positive', async () => {
    const el = await setup(creditNoteDetail);

    const amounts = Array.from(el.querySelectorAll('.invoice-detail__amount-value')).map(n =>
      n.textContent?.trim(),
    );
    expect(amounts).toContain('-980.00');
    expect(amounts).toContain('-490.00');
    expect(amounts.some(a => a === '980.00')).toBe(false);
    expect(component.isCredit('-980.00')).toBe(true);

    // The sign is announced in text, not carried by colour alone (ADR-0029).
    expect(el.querySelectorAll('.invoice-detail__amount--credit .sr-only').length).toBeGreaterThan(0);
  });

  it('labels the document as a credit note from the delivered type, not from the sign', async () => {
    const el = await setup(creditNoteDetail);

    const chips = Array.from(el.querySelectorAll('.invoice-detail__chips .supplier-chip__label')).map(
      n => n.textContent?.trim(),
    );
    expect(chips).toContain('POSITIVITY.INVOICE.TYPE.CREDIT_NOTE');
  });

  it('links the purchase order with a routerLink onto the platform UUID (ADR-0037)', async () => {
    const el = await setup();

    const link = el.querySelector('.invoice-detail__po-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/app/inventory/purchase-orders/po-uuid-1');
    expect(link.textContent?.trim()).toBe('PO-1042');
  });

  // #192 §7 asks for a voucher link. This frontend has no voucher/AP-bill
  // screen, so the reference is rendered as a searchable identifier rather than
  // a link that lands nowhere. Asserted so it stays a deliberate choice.
  it('renders the voucher reference as text, never as a link', async () => {
    const el = await setup();

    const ref = Array.from(el.querySelectorAll('.invoice-detail__ref')).find(
      n => n.textContent?.trim() === 'VCH-2026-0912',
    );
    expect(ref).toBeDefined();
    expect(ref?.tagName).toBe('CODE');
    expect(el.querySelector('a[href*="VCH-2026-0912"]')).toBeNull();
    expect(el.querySelector('a[href*="voucher"]')).toBeNull();
    expect(el.querySelector('a[href*="ap/bills"]')).toBeNull();
  });

  it('renders a missing voucher as a backend pending state with no user action', async () => {
    const el = await setup(unmatchedDetail);

    expect(component.voucherPending()).toBe(true);
    const chips = Array.from(el.querySelectorAll('.supplier-chip__label')).map(n =>
      n.textContent?.trim(),
    );
    expect(chips).toContain('POSITIVITY.INVOICE.VOUCHER.PENDING');

    const controlText = Array.from(el.querySelectorAll('button, a'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();
    expect(controlText).not.toMatch(/create.?voucher|link.?voucher|match|post|approve/);
  });

  it('shows the unmatched purchase order as a stated fact, not a broken link', async () => {
    const el = await setup(unmatchedDetail);

    expect(el.querySelector('.invoice-detail__po-link')).toBeNull();
    expect(el.querySelector('.invoice-detail__unmatched')?.textContent?.trim()).toBe(
      'POSITIVITY.INVOICE.DETAIL.PO_UNMATCHED',
    );
  });

  it('shows both versions of a DISCREPANCY with their own identity and amounts', async () => {
    const el = await setup(discrepancyDetail);

    const rows = el.querySelectorAll('.invoice-detail__version-row');
    expect(rows).toHaveLength(2);

    const refs = Array.from(rows).map(r => r.querySelector('th')?.textContent?.trim());
    expect(refs).toEqual(['v1', 'v2']);

    const numbers = Array.from(rows).map(r =>
      r.querySelector('.invoice-detail__version-number')?.textContent?.trim(),
    );
    expect(numbers).toEqual(['MX-INV-88213', 'MX-INV-88213-R']);

    const amounts = Array.from(rows).map(r =>
      r.querySelector('.invoice-detail__amount-value')?.textContent?.trim(),
    );
    expect(amounts).toEqual(['4820.75', '5120.75']);
  });

  it('never merges the two versions or computes a difference between them', async () => {
    const el = await setup(discrepancyDetail);

    // 5120.75 − 4820.75 = 300.00. The screen must not contain that figure: the
    // AP user sees two documents, not this component's arithmetic.
    expect(el.textContent).not.toContain('300.00');
    expect(el.textContent).not.toContain('300.0');
    expect(component.versions().map(v => v.versionRef)).toEqual(['v1', 'v2']);
  });

  it('keeps the earlier version visible and labels it rather than hiding it', async () => {
    const el = await setup(discrepancyDetail);

    const standings = Array.from(el.querySelectorAll('.invoice-detail__version-row')).map(r =>
      Array.from(r.querySelectorAll('.supplier-chip__label')).pop()?.textContent?.trim(),
    );
    expect(standings).toEqual([
      'POSITIVITY.INVOICE.VERSION.SUPERSEDED',
      'POSITIVITY.INVOICE.VERSION.CURRENT',
    ]);
  });

  it('renders the backend exception text verbatim beside a translated label', async () => {
    const el = await setup(unmatchedDetail);

    expect(el.querySelector('.invoice-detail__exception-text')?.textContent?.trim()).toBe(
      'No purchase order carries vendor order number MX-ORD-99182.',
    );
    expect(el.querySelector('.invoice-detail__exception .invoice-detail__term')?.textContent?.trim()).toBe(
      'POSITIVITY.INVOICE.DETAIL.EXCEPTION_DETAIL',
    );
  });

  it('offers no acknowledge, dismiss or edit control anywhere on the page', async () => {
    const el = await setup(discrepancyDetail);

    const controlText = Array.from(el.querySelectorAll('button, a, input, select, textarea'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();
    expect(controlText).not.toMatch(/acknowledge|dismiss|ignore|resolve|edit|save|approve|snooze/);
    expect(el.querySelectorAll('form')).toHaveLength(0);
  });

  it('renders a 403 as a restricted state without leaking the response body (ADR-0031)', async () => {
    const el = await setup(
      new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
        error: { message: 'ledger MX-INV-88213 restricted' },
      }),
    );

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'POSITIVITY.ERROR.FORBIDDEN',
    );
    expect(el.querySelector('.invoice-detail__summary')).toBeNull();
  });

  it('sets state then errorKey on a 5xx load failure and keeps retry available (ADR-0031)', async () => {
    const el = await setup(new HttpErrorResponse({ status: 503, statusText: 'Unavailable' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"] button')).not.toBeNull();
  });

  it('keeps the vendor as-of time and the platform fetch time as separate facts', async () => {
    const el = await setup();

    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n => n.textContent?.trim());
    expect(terms).toEqual([
      'POSITIVITY.INVOICE.DETAIL.AS_OF',
      'POSITIVITY.INVOICE.DETAIL.FETCHED_AT',
    ]);
  });

  it('formats a date-only issue date without shifting it a day (ADR-0038)', async () => {
    await setup();

    expect(component.issueDateFor('2026-08-04')).toBe('2026-08-04T00:00:00');
    expect(component.issueDateFor(null)).toBeNull();
  });
});
