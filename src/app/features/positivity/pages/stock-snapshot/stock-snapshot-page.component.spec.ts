/**
 * Vendor stock snapshot view (issue #193).
 *
 * The load-bearing assertions here are the two data-integrity properties:
 * a not-reported product never renders as `0`, and supplier stock never shares a
 * column or a total with owned inventory.
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockSnapshotPageComponent } from './stock-snapshot-page.component';
import { SupplierStockSnapshotService } from '../../services/supplier-stock-snapshot.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { SupplierStockSnapshot } from '../../models/supplier-stock-snapshot.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const VENDOR_ID = 'vp-1';

const snapshot: SupplierStockSnapshot = {
  snapshotId: 'snap-1',
  vendorProfileId: VENDOR_ID,
  vendorDisplayName: 'Michelin EU',
  scope: { type: 'COUNTRY', code: 'FR', label: 'France' },
  asOf: '2026-08-12T06:00:00Z',
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 720,
  lines: [
    {
      productId: null,
      sku: 'MX-2255',
      productName: 'Primacy 4 225/55R17',
      ean: '3528702345678',
      quantity: 120,
      unitOfMeasure: 'EA',
      warehouseName: 'Lyon DC',
    },
    {
      productId: null,
      sku: 'MX-1955',
      productName: 'Primacy 4 195/55R16',
      ean: null,
      quantity: 0,
      unitOfMeasure: 'EA',
      warehouseName: 'Lyon DC',
    },
    {
      productId: null,
      sku: 'MX-2050',
      productName: 'Pilot Sport 205/50R17',
      ean: null,
      quantity: null,
      unitOfMeasure: null,
      warehouseName: null,
    },
  ],
  totalLineCount: 3,
};

const vendors: VendorProfileSummary[] = [
  {
    vendorProfileId: VENDOR_ID,
    supplierRef: 'michelin-eu',
    displayName: 'Michelin EU',
    enabled: true,
    sandbox: false,
    sourceOfTruth: 'ADMIN',
  },
];

describe('StockSnapshotPageComponent', () => {
  let fixture: ComponentFixture<StockSnapshotPageComponent>;

  const service = { getLatestSnapshot: vi.fn() };
  const profiles = { listProfiles: vi.fn() };

  beforeEach(async () => {
    service.getLatestSnapshot.mockReturnValue(of(snapshot));
    profiles.listProfiles.mockReturnValue(of(vendors));

    await TestBed.configureTestingModule({
      imports: [StockSnapshotPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierStockSnapshotService, useValue: service },
        { provide: SupplierProfileService, useValue: profiles },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StockSnapshotPageComponent);
  });

  afterEach(() => vi.clearAllMocks());

  /** Render, choose a vendor, load. */
  function renderLoaded(patch: Partial<{ scopeCode: string; search: string }> = {}): HTMLElement {
    fixture.detectChanges();
    fixture.componentInstance.nowMs.set(NOW);
    fixture.componentInstance.filterForm.setValue({
      vendorProfileId: VENDOR_ID,
      scopeCode: patch.scopeCode ?? '',
      search: patch.search ?? '',
    });
    fixture.componentInstance.load();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('requests nothing until a vendor is chosen, and says so', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(service.getLatestSnapshot).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('prompt');
    expect(el.querySelector('.stock-snapshot__prompt')?.textContent?.trim()).toBe(
      'POSITIVITY.STOCK_SNAPSHOT.CHOOSE_VENDOR_PROMPT',
    );
  });

  it('loads the latest snapshot for the chosen vendor with the scope and search filters', () => {
    renderLoaded({ scopeCode: 'FR', search: 'MX-22' });

    expect(service.getLatestSnapshot).toHaveBeenCalledWith(VENDOR_ID, {
      scopeCode: 'FR',
      search: 'MX-22',
    });
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('renders the scope label for the snapshot', () => {
    const el = renderLoaded();

    const value = el.querySelectorAll('.stock-snapshot__value')[1];
    expect(value?.textContent).toContain('POSITIVITY.STOCK_SNAPSHOT.SCOPE.COUNTRY');
    expect(value?.textContent).toContain('France');
  });

  it('renders an unrecognised scope type verbatim', () => {
    service.getLatestSnapshot.mockReturnValue(
      of({ ...snapshot, scope: { type: 'REGION_CLUSTER', code: 'EU-W', label: null } }),
    );
    const el = renderLoaded();

    expect(el.querySelectorAll('.stock-snapshot__value')[1]?.textContent).toContain(
      'REGION_CLUSTER',
    );
    expect(fixture.componentInstance.scopeTypeKey()).toBeNull();
  });

  it('renders a not-reported product distinctly from an explicit zero', () => {
    const el = renderLoaded();
    const rows = Array.from(el.querySelectorAll('tbody tr'));

    // Explicit vendor zero — a real number the vendor stated.
    expect(rows[1].querySelector('.stock-snapshot__supplier-quantity')?.textContent?.trim()).toBe(
      '0',
    );
    expect(rows[1].querySelector('.stock-snapshot__not-reported')).toBeNull();

    // Not reported — never rendered as a number, and never as 0.
    expect(rows[2].querySelector('.stock-snapshot__supplier-quantity')).toBeNull();
    expect(rows[2].querySelector('.stock-snapshot__not-reported')?.textContent?.trim()).toBe(
      'POSITIVITY.STOCK_SNAPSHOT.NOT_REPORTED',
    );
    expect(rows[2].querySelector('.stock-snapshot__quantity')?.textContent).not.toContain('0');
  });

  it('classifies a null quantity as not reported and a zero as reported', () => {
    renderLoaded();

    expect(fixture.componentInstance.isNotReported(snapshot.lines[1])).toBe(false);
    expect(fixture.componentInstance.isNotReported(snapshot.lines[2])).toBe(true);
  });

  it('says "not reported" — not "none in stock" — when a search matches no line', () => {
    service.getLatestSnapshot.mockReturnValue(of({ ...snapshot, lines: [] }));
    const el = renderLoaded({ search: 'MX-9999' });

    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.searchNotReported()).toBe(true);
    expect(el.querySelector('.stock-snapshot__not-reported-notice')?.textContent?.trim()).toBe(
      'POSITIVITY.STOCK_SNAPSHOT.SEARCH_NOT_REPORTED',
    );
    expect(el.querySelector('tbody')).toBeNull();
  });

  it('labels quantities as supplier stock and shows no owned-inventory column', () => {
    const el = renderLoaded();

    const headers = Array.from(el.querySelectorAll('thead th')).map(h => h.textContent ?? '');
    expect(headers.join(' ')).toContain('POSITIVITY.STOCK_SNAPSHOT.TABLE.SUPPLIER_QUANTITY');
    expect(headers.join(' ')).toContain('POSITIVITY.STOCK_SNAPSHOT.TABLE.SUPPLIER_QUANTITY_NOTE');

    const headerText = headers.join(' ').toLowerCase();
    expect(headerText).not.toMatch(/on.?hand|owned|available_?stock|total/);

    // One quantity column only: there is nothing to sum supplier stock into.
    const quantityCells = el.querySelectorAll('tbody tr:first-child .stock-snapshot__quantity');
    expect(quantityCells).toHaveLength(1);
    expect(el.querySelector('tfoot')).toBeNull();
  });

  it('shows the vendor snapshot time and the fetch time as separate labelled facts', () => {
    const el = renderLoaded();

    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n => n.textContent?.trim());
    expect(terms).toEqual([
      'POSITIVITY.STOCK_SNAPSHOT.AS_OF',
      'POSITIVITY.STOCK_SNAPSHOT.FETCHED_AT',
    ]);
  });

  it('computes staleness from the vendor asOf against the backend threshold', () => {
    const el = renderLoaded();

    // asOf is 6 hours old against a 720-minute (12h) threshold — current.
    expect(el.querySelector('.staleness__chip .supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.FRESHNESS.CURRENT',
    );
  });

  it('marks a snapshot stale from its asOf even when the fetch was a minute ago', () => {
    service.getLatestSnapshot.mockReturnValue(
      of({ ...snapshot, asOf: '2026-08-10T06:00:00Z', fetchedAt: '2026-08-12T11:59:30Z' }),
    );
    const el = renderLoaded();

    expect(el.querySelector('.staleness__chip .supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.FRESHNESS.STALE',
    );
  });

  it('honours a backend threshold of 0 by disabling the staleness verdict', () => {
    service.getLatestSnapshot.mockReturnValue(
      of({ ...snapshot, asOf: '2020-01-01T00:00:00Z', stalenessThresholdMinutes: 0 }),
    );
    const el = renderLoaded();

    expect(el.querySelector('.staleness__chip .supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.FRESHNESS.CURRENT',
    );
  });

  it('renders a vendor with no published snapshot as empty, not as an error', () => {
    service.getLatestSnapshot.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    const el = renderLoaded();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(fixture.componentInstance.errorKey()).toBeNull();
    expect(el.querySelector('.stock-snapshot__empty')?.textContent?.trim()).toBe(
      'POSITIVITY.STOCK_SNAPSHOT.NO_SNAPSHOT',
    );
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    service.getLatestSnapshot.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = renderLoaded();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('sets state then errorKey on a 5xx and keeps retry available (ADR-0031)', () => {
    service.getLatestSnapshot.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    const el = renderLoaded();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('returns to the prompt when the vendor selection is cleared', () => {
    renderLoaded();
    fixture.componentInstance.clearFilter();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('prompt');
    expect(fixture.componentInstance.snapshot()).toBeNull();
  });

  it('exposes no write path on the page', () => {
    renderLoaded();
    const methodNames = Object.getOwnPropertyNames(
      Object.getPrototypeOf(fixture.componentInstance),
    );
    expect(methodNames.some(name => /save|create|update|delete|reserve/i.test(name))).toBe(false);
  });
});
