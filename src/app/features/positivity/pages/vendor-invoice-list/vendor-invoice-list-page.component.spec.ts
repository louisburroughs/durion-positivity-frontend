/**
 * Ingested vendor invoice list / exception worklist (issue #192).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VendorInvoiceListPageComponent } from './vendor-invoice-list-page.component';
import { SupplierInvoiceService } from '../../services/supplier-invoice.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierInvoicePage,
  SupplierInvoiceSummary,
} from '../../models/supplier-invoice.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const invoice: SupplierInvoiceSummary = {
  invoiceId: 'inv-1',
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

const creditNote: SupplierInvoiceSummary = {
  invoiceId: 'inv-2',
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

const discrepancy: SupplierInvoiceSummary = {
  invoiceId: 'inv-3',
  vendorProfileId: 'vp-2',
  vendorDisplayName: 'Continental DE',
  invoiceNumber: 'CO-INV-4410-R',
  issueDate: '2026-08-09',
  type: 'INVOICE',
  amount: '5120.75',
  currency: 'EUR',
  voucherReference: 'VCH-2026-0980',
  voucherStatus: 'LINKED',
  flags: ['DISCREPANCY'],
  fetchedAt: '2026-08-12T12:00:00Z',
};

const listPage: SupplierInvoicePage = {
  items: [invoice, creditNote, discrepancy],
  totalCount: 3,
  nextPageToken: null,
};

const exceptionPage: SupplierInvoicePage = {
  items: [creditNote, discrepancy],
  totalCount: 2,
  nextPageToken: null,
};

const vendorProfile: VendorProfileSummary = {
  vendorProfileId: 'vp-1',
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: 'ADMIN',
};

describe('VendorInvoiceListPageComponent', () => {
  let fixture: ComponentFixture<VendorInvoiceListPageComponent>;
  let component: VendorInvoiceListPageComponent;

  const service = {
    listInvoices: vi.fn(),
    listExceptions: vi.fn(),
    getInvoice: vi.fn(),
  };

  const profiles = { listProfiles: vi.fn() };

  async function setup(routeData: Record<string, unknown> = {}): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VendorInvoiceListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierInvoiceService, useValue: service },
        { provide: SupplierProfileService, useValue: profiles },
        { provide: ActivatedRoute, useValue: { snapshot: { data: routeData } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorInvoiceListPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service.listInvoices.mockReturnValue(of(listPage));
    service.listExceptions.mockReturnValue(of(exceptionPage));
    profiles.listProfiles.mockReturnValue(of([vendorProfile]));
  });

  it('renders ingested invoices with type, amounts, flags and voucher linkage', async () => {
    const el = await setup();

    expect(service.listInvoices).toHaveBeenCalled();
    expect(component.state()).toBe('ready');

    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);

    const typeLabels = Array.from(rows).map(
      r => r.querySelectorAll('.supplier-chip__label')[0]?.textContent?.trim(),
    );
    expect(typeLabels[0]).toBe('POSITIVITY.INVOICE.TYPE.INVOICE');
    expect(typeLabels[1]).toBe('POSITIVITY.INVOICE.TYPE.CREDIT_NOTE');
  });

  it('renders amounts exactly as delivered, beside the delivered currency code', async () => {
    const el = await setup();

    const amounts = Array.from(el.querySelectorAll('.vendor-invoices__amount-value')).map(n =>
      n.textContent?.trim(),
    );
    expect(amounts).toEqual(['4820.75', '-980.00', '5120.75']);

    const currencies = Array.from(el.querySelectorAll('.vendor-invoices__currency')).map(n =>
      n.textContent?.trim(),
    );
    expect(currencies).toEqual(['EUR', 'EUR', 'EUR']);
    // No CurrencyPipe anywhere: a localised symbol would be a figure the
    // backend never sent for a document that gets paid at its face value.
    expect(el.textContent).not.toContain('€');
    expect(el.textContent).not.toContain('$');
  });

  it('never coerces a credit note positive and announces the credit in text', async () => {
    const el = await setup();

    const creditCell = el.querySelectorAll('.vendor-invoices__amount')[1];
    expect(creditCell.textContent).toContain('-980.00');
    expect(creditCell.querySelector('.sr-only')?.textContent?.trim()).toBe(
      'POSITIVITY.INVOICE.AMOUNT.CREDIT_SR',
    );
    expect(creditCell.classList.contains('vendor-invoices__amount--credit')).toBe(true);
    expect(component.isCredit(creditNote)).toBe(true);
    expect(component.isCredit(invoice)).toBe(false);
  });

  it('renders a pending voucher as a backend state, never as a task or a link', async () => {
    const el = await setup();
    const rows = el.querySelectorAll('tbody tr');

    const linked = rows[0].querySelector('.vendor-invoices__ref');
    expect(linked?.textContent?.trim()).toBe('VCH-2026-0912');
    expect(linked?.tagName).toBe('CODE');

    const pendingChip = rows[1].querySelectorAll('.supplier-chip__label')[1];
    expect(pendingChip?.textContent?.trim()).toBe('POSITIVITY.INVOICE.VOUCHER.PENDING');
    // No control, and no link, is offered to "fix" a pending voucher.
    expect(rows[1].querySelectorAll('button')).toHaveLength(0);
  });

  it('links the invoice number to the detail screen with the platform UUID', async () => {
    const el = await setup();

    const link = el.querySelector('tbody tr th a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/app/accounting/payables/vendor-invoices/inv-1');
  });

  it('calls the dedicated exception endpoint on the worklist route', async () => {
    await setup({ exceptionsOnly: true });

    expect(component.exceptionsOnly()).toBe(true);
    expect(service.listExceptions).toHaveBeenCalled();
    expect(service.listInvoices).not.toHaveBeenCalled();
    expect(component.titleKey()).toBe('POSITIVITY.INVOICE.EXCEPTIONS.TITLE');
  });

  it('shows both UNMATCHED and DISCREPANCY rows on the worklist and never narrows to one flag', async () => {
    const el = await setup({ exceptionsOnly: true });

    const flagLabels = Array.from(el.querySelectorAll('.vendor-invoices__flags .supplier-chip__label')).map(
      n => n.textContent?.trim(),
    );
    expect(flagLabels).toEqual([
      'POSITIVITY.INVOICE.FLAG.UNMATCHED',
      'POSITIVITY.INVOICE.FLAG.DISCREPANCY',
    ]);
    // The flag filter is not even rendered on the worklist, so no operator
    // action can hide one exception kind behind the other.
    expect(el.querySelector('#vendor-invoices-flag')).toBeNull();
    expect(service.listExceptions.mock.calls[0][0].flag).toBeUndefined();
  });

  it('offers no dismiss, acknowledge or resolve control on a flagged row', async () => {
    const el = await setup({ exceptionsOnly: true });

    const controlText = Array.from(el.querySelectorAll('button, a, input[type="submit"]'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();

    expect(controlText).not.toMatch(/dismiss|acknowledge|ignore|resolve|clear.?flag|snooze|hide/);
  });

  it('keeps a flagged row until the backend stops reporting the flag', async () => {
    const el = await setup({ exceptionsOnly: true });
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);

    // Every button on the page is exercised; nothing removes a row, because
    // nothing on this screen can.
    el.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.click());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);

    // The backend resolves it — and only then does the row leave.
    service.listExceptions.mockReturnValue(
      of({ items: [discrepancy], totalCount: 1, nextPageToken: null }),
    );
    component.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('forwards the vendor, search, type and flag filters to the backend', async () => {
    await setup();
    component.filterForm.setValue({
      vendorProfileId: 'vp-1',
      search: '  MX-INV  ',
      type: 'CREDIT_NOTE',
      flag: 'UNMATCHED',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
    component.applyFilter();

    expect(service.listInvoices).toHaveBeenLastCalledWith({
      vendorProfileId: 'vp-1',
      search: 'MX-INV',
      type: 'CREDIT_NOTE',
      flag: 'UNMATCHED',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
  });

  it('reports empty rather than error when nothing has been ingested', async () => {
    service.listInvoices.mockReturnValue(of({ items: [], totalCount: 0, nextPageToken: null }));
    const el = await setup();

    expect(component.state()).toBe('empty');
    expect(component.errorKey()).toBeNull();
    expect(el.querySelector('.vendor-invoices__empty')).not.toBeNull();
  });

  it('renders a 403 as a restricted state without leaking the response body (ADR-0031)', async () => {
    service.listInvoices.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            statusText: 'Forbidden',
            error: { message: 'vendor MICHELIN ledger 88213 restricted' },
          }),
      ),
    );
    const el = await setup();

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'POSITIVITY.ERROR.FORBIDDEN',
    );
    expect(el.textContent).not.toContain('88213');
    expect(el.querySelector('tbody')).toBeNull();
  });

  it('sets state before errorKey on a 5xx failure (ADR-0031)', async () => {
    service.listInvoices.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    await setup();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('still lists invoices when the vendor roster cannot be read', async () => {
    profiles.listProfiles.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    const el = await setup();

    expect(component.state()).toBe('ready');
    expect(component.vendorFilterAvailable()).toBe(false);
    expect(el.querySelector('#vendor-invoices-vendor')).toBeNull();
  });

  it('formats a date-only issue date without shifting it a day (ADR-0038)', async () => {
    await setup();

    expect(component.issueDateFor('2026-08-04')).toBe('2026-08-04T00:00:00');
    expect(component.issueDateFor(null)).toBeNull();
  });

  it('gives every table a caption and every filter input a label (ADR-0029)', async () => {
    const el = await setup();

    expect(el.querySelector('table caption')).not.toBeNull();
    const inputs = Array.from(el.querySelectorAll('input, select'));
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(el.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    }
  });
});
