/**
 * Manual-review queue (issue #191).
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
import { ManualReviewQueuePageComponent } from './manual-review-queue-page.component';
import { SupplierOrderTransmissionService } from '../../services/supplier-order-transmission.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierManualReviewItem,
  SupplierManualReviewPage,
} from '../../models/supplier-order-transmission.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const PO_A = 'ffc9a4c2-0000-7000-8000-00000000000a';
const PO_B = 'ffc9a4c2-0000-7000-8000-00000000000b';

const rowA: SupplierManualReviewItem = {
  purchaseOrderId: PO_A,
  poNumber: 'PO-1042',
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  vendorOrderNumber: null,
  state: 'MANUAL_REVIEW',
  reason: 'NO_VENDOR_ACK',
  detectedAt: '2026-08-12T10:15:00Z',
  resolutionActions: [{ action: 'CONFIRM_MATCHED' }, { action: 'MARK_REJECTED' }],
  resolved: false,
};

const rowB: SupplierManualReviewItem = {
  purchaseOrderId: PO_B,
  poNumber: 'PO-1043',
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  vendorOrderNumber: 'MX-ORD-77000',
  state: 'MANUAL_REVIEW',
  reason: 'AMBIGUOUS_ACK',
  detectedAt: '2026-08-12T10:20:00Z',
  resolutionActions: [],
  resolved: false,
};

const page: SupplierManualReviewPage = {
  items: [rowA, rowB],
  totalCount: 2,
  nextPageToken: null,
};

const resolvedA: SupplierManualReviewItem = {
  ...rowA,
  state: 'CONFIRMED',
  vendorOrderNumber: 'MX-ORD-99182',
  resolutionActions: [],
  resolved: true,
};

const racedA: SupplierManualReviewItem = {
  ...rowA,
  state: 'REJECTED',
  resolutionActions: [],
  resolved: true,
};

const vendors: VendorProfileSummary[] = [
  {
    vendorProfileId: 'vp-1',
    supplierRef: 'michelin-eu',
    displayName: 'Michelin EU',
    enabled: true,
    sandbox: false,
    sourceOfTruth: 'ADMIN',
  },
];

describe('ManualReviewQueuePageComponent', () => {
  let fixture: ComponentFixture<ManualReviewQueuePageComponent>;

  const service = {
    getTransmission: vi.fn(),
    getStatusHistory: vi.fn(),
    listManualReview: vi.fn(),
    getManualReviewItem: vi.fn(),
    resolveManualReview: vi.fn(),
  };
  const profiles = { listProfiles: vi.fn() };

  beforeEach(async () => {
    service.listManualReview.mockReturnValue(of(page));
    service.resolveManualReview.mockReturnValue(of(resolvedA));
    service.getManualReviewItem.mockReturnValue(of(racedA));
    profiles.listProfiles.mockReturnValue(of(vendors));

    await TestBed.configureTestingModule({
      imports: [ManualReviewQueuePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierOrderTransmissionService, useValue: service },
        { provide: SupplierProfileService, useValue: profiles },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManualReviewQueuePageComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists the ambiguous transmissions returned by the backend', () => {
    const el = render();

    expect(service.listManualReview).toHaveBeenCalledWith({});
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('links each row to its order by UUID, never by the vendor order number', () => {
    const el = render();

    const link = el.querySelector<HTMLAnchorElement>('.review-queue__link');
    expect(link?.getAttribute('href')).toBe(`/app/inventory/purchase-orders/${PO_A}`);
    expect(el.querySelector('.review-queue__ref')?.textContent?.trim()).toBe('MX-ORD-77000');
  });

  it('offers no re-send, retry or re-transmit affordance on any row', () => {
    const el = render();

    const text = Array.from(el.querySelectorAll('button, a'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();

    expect(text).not.toMatch(/resend|re-send|retransmit|re-transmit|send.?again/);
  });

  it('renders only the actions the backend delivered — none for a row that has none', () => {
    const el = render();
    const rows = Array.from(el.querySelectorAll('tbody tr'));

    expect(rows[0].querySelectorAll('.review-actions__trigger')).toHaveLength(2);
    expect(rows[1].querySelectorAll('.review-actions__trigger')).toHaveLength(0);
  });

  it('does not resolve on the first click — a confirmation is required', () => {
    const el = render();
    el.querySelector<HTMLButtonElement>('.review-actions__trigger')?.click();
    fixture.detectChanges();

    expect(service.resolveManualReview).not.toHaveBeenCalled();
    expect(el.querySelector('.review-confirm__risk')).not.toBeNull();
  });

  it('reflects a confirmed resolution in the row immediately', () => {
    const el = render();
    fixture.componentInstance.resolve(rowA, 'CONFIRM_MATCHED');
    fixture.detectChanges();

    expect(service.resolveManualReview).toHaveBeenCalledWith(PO_A, 'CONFIRM_MATCHED');
    expect(fixture.componentInstance.rows()[0].resolved).toBe(true);
    expect(fixture.componentInstance.noticeFor(PO_A)).toBe(
      'POSITIVITY.MANUAL_REVIEW.NOTICE.RESOLVED',
    );
    expect(el.querySelectorAll('tbody tr')[0].querySelectorAll('.review-actions__trigger')).toHaveLength(
      0,
    );
  });

  it('refreshes the row on 409 instead of showing a dead page error', () => {
    render();
    service.resolveManualReview.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );

    fixture.componentInstance.resolve(rowA, 'CONFIRM_MATCHED');
    fixture.detectChanges();

    expect(service.getManualReviewItem).toHaveBeenCalledWith(PO_A);
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.errorKey()).toBeNull();
    expect(fixture.componentInstance.rows()[0].state).toBe('REJECTED');
    expect(fixture.componentInstance.noticeFor(PO_A)).toBe(
      'POSITIVITY.MANUAL_REVIEW.NOTICE.RACED_BY_VENDOR',
    );
  });

  it('leaves every other row untouched when one row races', () => {
    render();
    service.resolveManualReview.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );

    fixture.componentInstance.resolve(rowA, 'CONFIRM_MATCHED');
    fixture.detectChanges();

    expect(fixture.componentInstance.rows()[1]).toEqual(rowB);
    expect(fixture.componentInstance.noticeFor(PO_B)).toBeNull();
  });

  it('sets state then errorKey when a resolution fails for another reason (ADR-0031)', () => {
    render();
    service.resolveManualReview.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );

    fixture.componentInstance.resolve(rowA, 'MARK_REJECTED');
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a 403 on the queue read as a restricted state (ADR-0031)', () => {
    service.listManualReview.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders an empty queue as a clean state, not an error', () => {
    service.listManualReview.mockReturnValue(of({ items: [], totalCount: 0, nextPageToken: null }));
    const el = render();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(el.querySelector('.review-queue__empty')?.textContent?.trim()).toBe(
      'POSITIVITY.MANUAL_REVIEW.EMPTY',
    );
  });

  it('forwards the vendor, search and date filters', () => {
    render();
    fixture.componentInstance.filterForm.setValue({
      vendorProfileId: 'vp-1',
      search: '  PO-1042  ',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
    fixture.componentInstance.applyFilter();

    expect(service.listManualReview).toHaveBeenLastCalledWith({
      vendorProfileId: 'vp-1',
      search: 'PO-1042',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
  });

  it('keeps the queue usable when the vendor roster cannot be read', () => {
    profiles.listProfiles.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = render();

    expect(fixture.componentInstance.vendorFilterAvailable()).toBe(false);
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.querySelector('#review-queue-vendor')).toBeNull();
  });

  it('renders the detection time as a real time element', () => {
    const el = render();

    expect(el.querySelector('tbody time')?.getAttribute('datetime')).toBe('2026-08-12T10:15:00Z');
  });
});
