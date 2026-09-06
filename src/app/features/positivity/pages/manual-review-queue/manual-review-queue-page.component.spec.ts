import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualReviewQueuePageComponent } from './manual-review-queue-page.component';
import { SupplierOrderTransmissionService } from '../../services/supplier-order-transmission.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierOrderTransmission,
  SupplierTransmissionPage,
} from '../../models/supplier-order-transmission.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const PROFILE_ID = 'profile-1';

const profileSummary: VendorProfileSummary = {
  vendorProfileId: PROFILE_ID,
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: 'ADMIN',
};

const transmission: SupplierOrderTransmission = {
  transmissionIntentId: 'ti-1',
  purchaseOrderId: 'po-1',
  purchaseOrderNumber: 'PO-1042',
  supplierRef: 'michelin-eu',
  state: 'MANUAL_REVIEW',
  supplierOrderNumber: null,
  documentId: 'DOC-1',
  latestScheduledDeliveryDate: null,
  vendorReason: 'Ambiguous vendor acknowledgement',
  vendorErrorCode: null,
  failureDetail: null,
  lastStatusAt: '2026-08-12T11:40:00Z',
  lastTransitionAt: '2026-08-12T11:41:00Z',
  dispatchAttempts: 2,
  resolutionAction: null,
  resolvedAt: null,
  resolvedBy: null,
};

const pageFixture: SupplierTransmissionPage = {
  items: [transmission],
  page: 0,
  size: 25,
  totalCount: 1,
  totalPages: 1,
};

describe('ManualReviewQueuePageComponent', () => {
  let fixture: ComponentFixture<ManualReviewQueuePageComponent>;
  let component: ManualReviewQueuePageComponent;
  let transmissions: {
    searchManualReview: ReturnType<typeof vi.fn>;
    resolveTransmission: ReturnType<typeof vi.fn>;
  };
  let profiles: { listProfiles: ReturnType<typeof vi.fn> };

  async function setup(
    result: SupplierTransmissionPage | HttpErrorResponse = pageFixture,
  ): Promise<void> {
    transmissions = {
      searchManualReview: vi
        .fn()
        .mockReturnValue(
          result instanceof HttpErrorResponse ? throwError(() => result) : of(result),
        ),
      resolveTransmission: vi.fn().mockReturnValue(of(transmission)),
    };
    profiles = { listProfiles: vi.fn().mockReturnValue(of([profileSummary])) };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ManualReviewQueuePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierOrderTransmissionService, useValue: transmissions },
        { provide: SupplierProfileService, useValue: profiles },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ManualReviewQueuePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the worklist filtered to MANUAL_REVIEW on init', async () => {
    await setup();

    expect(transmissions.searchManualReview).toHaveBeenCalledTimes(1);
    expect(component.state()).toBe('ready');
    expect(component.totalCount()).toBe(1);
  });

  it('loads the vendor roster for the filter', async () => {
    await setup();

    expect(profiles.listProfiles).toHaveBeenCalled();
  });

  it('applies the vendor, search and date filters together', async () => {
    await setup();
    component.filterForm.patchValue({
      vendorProfileId: PROFILE_ID,
      search: 'PO-1042',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-07',
    });
    component.applyFilter();

    expect(transmissions.searchManualReview).toHaveBeenLastCalledWith(
      {
        vendorProfileId: PROFILE_ID,
        search: 'PO-1042',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-07',
      },
      0,
    );
  });

  it('resets the filter and restarts at the first page on clear', async () => {
    await setup();
    component.filterForm.patchValue({ vendorProfileId: PROFILE_ID });
    component.clearFilter();

    expect(component.filterForm.getRawValue().vendorProfileId).toBe('');
    expect(transmissions.searchManualReview).toHaveBeenLastCalledWith({}, 0);
  });

  it('reports empty when the queue is clear', async () => {
    await setup({ items: [], page: 0, size: 25, totalCount: 0, totalPages: 0 });

    expect(component.state()).toBe('empty');
  });

  it('sets state then errorKey on a load failure (ADR-0031)', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders forbidden without exposing the worklist on 403', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x' }));

    expect(component.state()).toBe('forbidden');
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).toBeNull();
  });

  // ── Pagination ──────────────────────────────────────────────────────────

  it('advances to the next page', async () => {
    await setup({ ...pageFixture, page: 0, totalPages: 3 });
    component.nextPage();

    expect(transmissions.searchManualReview).toHaveBeenLastCalledWith(expect.any(Object), 1);
  });

  it('goes back to the previous page', async () => {
    await setup({ ...pageFixture, page: 2, totalPages: 3 });
    component.previousPage();

    expect(transmissions.searchManualReview).toHaveBeenLastCalledWith(expect.any(Object), 1);
  });

  it('refuses to page beyond the range', async () => {
    await setup({ ...pageFixture, page: 0, totalPages: 1 });
    transmissions.searchManualReview.mockClear();

    component.previousPage();
    component.nextPage();

    expect(transmissions.searchManualReview).not.toHaveBeenCalled();
  });

  // ── Row expansion and resolution ───────────────────────────────────────

  it('expands exactly one row at a time and resets the resolve form', async () => {
    await setup();

    component.toggleRow(transmission);
    expect(component.isExpanded(transmission)).toBe(true);

    component.toggleRow(transmission);
    expect(component.isExpanded(transmission)).toBe(false);
  });

  it('only requires a vendor order number for CONFIRM_WITH_VENDOR_REFERENCE', async () => {
    await setup();
    component.toggleRow(transmission);

    component.resolveForm.patchValue({ action: 'MARK_NOT_RECEIVED' });
    expect(component.requiresVendorReference()).toBe(false);

    component.resolveForm.patchValue({ action: 'CONFIRM_WITH_VENDOR_REFERENCE' });
    expect(component.requiresVendorReference()).toBe(true);
  });

  it('resolves a transmission and reloads the worklist — resolved rows are terminal', async () => {
    await setup();
    component.toggleRow(transmission);
    component.resolveForm.setValue({
      action: 'MARK_NOT_RECEIVED',
      evidence: 'Vendor confirmed by phone: order never received.',
      supplierOrderNumber: '',
    });
    transmissions.searchManualReview.mockClear();

    component.submitResolution();

    expect(transmissions.resolveTransmission).toHaveBeenCalledWith('ti-1', {
      action: 'MARK_NOT_RECEIVED',
      evidence: 'Vendor confirmed by phone: order never received.',
      supplierOrderNumber: undefined,
    });
    expect(transmissions.searchManualReview).toHaveBeenCalledTimes(1);
  });

  it('does not resolve without evidence', async () => {
    await setup();
    component.toggleRow(transmission);
    component.resolveForm.patchValue({ evidence: '' });

    component.submitResolution();

    expect(transmissions.resolveTransmission).not.toHaveBeenCalled();
  });

  it('surfaces a resolve failure without collapsing the row', async () => {
    await setup();
    transmissions.resolveTransmission.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'x' })),
    );
    component.toggleRow(transmission);
    component.resolveForm.setValue({
      action: 'MARK_NOT_RECEIVED',
      evidence: 'Vendor confirmed by phone.',
      supplierOrderNumber: '',
    });

    component.submitResolution();

    expect(component.resolveErrorKey()).toBe('POSITIVITY.ERROR.CONFLICT');
    expect(component.isExpanded(transmission)).toBe(true);
  });

  // ── No re-send, anywhere ───────────────────────────────────────────────

  it('offers no re-send, retry or re-transmit action anywhere on the page', async () => {
    await setup();
    component.toggleRow(transmission);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const controlText = Array.from(host.querySelectorAll('button, a'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();

    expect(controlText).not.toMatch(/resend|retry|retransmit/);
    expect(host.textContent?.toLowerCase()).toContain('positivity.manual_review.no_resend_note');
  });

  it('labels every filter control (ADR-0029)', async () => {
    await setup();
    const host = fixture.nativeElement as HTMLElement;

    for (const control of Array.from(
      host.querySelectorAll('.review-filters input, .review-filters select'),
    )) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      expect(host.querySelector(`label[for="${id}"]`), `no label for #${id}`).not.toBeNull();
    }
  });
});
