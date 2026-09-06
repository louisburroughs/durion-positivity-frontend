/**
 * SupplierStockSnapshotPanelComponent tests (#217).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierStockSnapshotPanelComponent } from './supplier-stock-snapshot-panel.component';
import { SupplierStockSnapshotService } from '../../services/supplier-stock-snapshot.service';
import { StockSnapshotLinePage, StockSnapshotSummary } from '../../models/supplier-stock-snapshot.models';

const VENDOR_ID = 'vp-0000-0001';
const SNAPSHOT_ID = 'snap-0000-0001';

const summaryFixture: StockSnapshotSummary = {
  snapshotId: SNAPSHOT_ID,
  vendorProfileId: VENDOR_ID,
  supplierRef: 'michelin-eu',
  buyerAccountNumber: 'ACC-1',
  countryCode: 'FR',
  documentId: 'DOC-1',
  issuedOn: '2026-08-11',
  snapshotAsOf: '2026-08-12T06:00:00Z',
  fetchedAt: '2026-08-12T07:15:00Z',
  completedAt: '2026-08-12T07:15:30Z',
  status: 'COMPLETED',
  protocolVersion: 'S2S_V1',
  linesReported: 2,
  linesRejected: 0,
};

const linesPageFixture: StockSnapshotLinePage = {
  items: [
    {
      lineId: 'line-1',
      vendorLineId: '417',
      articleEan: '3528709999083',
      supplierArticleCode: '999908',
      buyersArticleId: 'TY-4471',
      description: 'MICHELIN PILOT SPORT 5 225/45R17',
      availableQuantity: 0,
    },
    {
      lineId: 'line-2',
      vendorLineId: '418',
      articleEan: '3528709999090',
      supplierArticleCode: '999909',
      buyersArticleId: 'TY-4472',
      description: 'MICHELIN PILOT SPORT 5 235/45R17',
      availableQuantity: null,
    },
  ],
  page: 0,
  size: 25,
  totalCount: 2,
  totalPages: 1,
};

describe('SupplierStockSnapshotPanelComponent', () => {
  let fixture: ComponentFixture<SupplierStockSnapshotPanelComponent>;
  let component: SupplierStockSnapshotPanelComponent;
  let service: {
    getLatestSnapshot: ReturnType<typeof vi.fn>;
    listLines: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getLatestSnapshot: vi.fn().mockReturnValue(of(summaryFixture)),
      listLines: vi.fn().mockReturnValue(of(linesPageFixture)),
    };
    await TestBed.configureTestingModule({
      imports: [SupplierStockSnapshotPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierStockSnapshotService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(SupplierStockSnapshotPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  function render(vendorProfileId = VENDOR_ID): HTMLElement {
    fixture.componentRef.setInput('vendorProfileId', vendorProfileId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('fetches metadata first, then pages lines by the resolved snapshotId', () => {
    render();

    expect(service.getLatestSnapshot).toHaveBeenCalledWith(VENDOR_ID);
    expect(service.listLines).toHaveBeenCalledWith(VENDOR_ID, SNAPSHOT_ID, '', 0);
  });

  it('never calls listLines before a snapshotId has resolved', () => {
    service.getLatestSnapshot.mockReturnValue(new Subject<StockSnapshotSummary>().asObservable());
    render();

    expect(service.listLines).not.toHaveBeenCalled();
  });

  it('keeps snapshotAsOf and fetchedAt as two distinct facts', () => {
    const el = render();

    expect(el.textContent).toContain('POSITIVITY.STOCK_SNAPSHOT.SUMMARY.SNAPSHOT_AS_OF');
    expect(el.textContent).toContain('POSITIVITY.STOCK_SNAPSHOT.SUMMARY.FETCHED_AT');
    expect(component.summary()?.snapshotAsOf).not.toBe(component.summary()?.fetchedAt);
  });

  it('treats a missing snapshot (404) as a normal empty state', () => {
    service.getLatestSnapshot.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'x' })),
    );
    const el = render();

    expect(component.summaryState()).toBe('empty');
    expect(component.summaryErrorKey()).toBeNull();
    expect(el.textContent).toContain('POSITIVITY.STOCK_SNAPSHOT.SUMMARY.NONE');
    expect(service.listLines).not.toHaveBeenCalled();
  });

  it('renders a 403 on the metadata read as forbidden', () => {
    service.getLatestSnapshot.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' })),
    );
    render();

    expect(component.summaryState()).toBe('forbidden');
  });

  it('distinguishes a zero quantity from an unstated one', () => {
    const el = render();
    const rows = Array.from(el.querySelectorAll('tbody tr'));

    expect(rows[0].textContent).toContain('0');
    expect(rows[1].textContent).toContain('POSITIVITY.STOCK_SNAPSHOT.LINES.QUANTITY_UNSTATED');
  });

  it('sends the search term as a real query parameter', () => {
    render();
    component.searchForm.setValue({ search: 'pilot' });
    component.applySearch();

    expect(service.listLines).toHaveBeenLastCalledWith(VENDOR_ID, SNAPSHOT_ID, 'pilot', 0);
  });

  it('never adds a scopeCode filter — no such column exists on this contract', () => {
    const el = render();

    expect(el.textContent?.toLowerCase()).not.toContain('scopecode');
    expect(component).not.toHaveProperty('scopeCode');
  });

  it('paginates lines against the same snapshotId', () => {
    service.listLines.mockReturnValue(of({ ...linesPageFixture, totalPages: 2 }));
    render();
    service.listLines.mockReturnValue(of({ ...linesPageFixture, page: 1, totalPages: 2 }));
    component.nextPage();

    expect(service.listLines).toHaveBeenLastCalledWith(VENDOR_ID, SNAPSHOT_ID, '', 1);
  });

  it('reports empty when no lines match the search', () => {
    service.listLines.mockReturnValue(
      of({ items: [], page: 0, size: 25, totalCount: 0, totalPages: 0 }),
    );
    render();

    expect(component.linesState()).toBe('empty');
  });

  it('labels the search control (ADR-0029)', () => {
    const el = render();
    const input = el.querySelector('#stock-snapshot-search');

    expect(input).not.toBeNull();
    expect(el.querySelector('label[for="stock-snapshot-search"]')).not.toBeNull();
  });
});
