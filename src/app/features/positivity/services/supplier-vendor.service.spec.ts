/**
 * SupplierVendorService contract tests (ADR-0035: every public method covered;
 * ADR-0032: fixtures typed as the SDK's own view types).
 */
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PagedResponseVendorView,
  RemitChangeView,
  RemitChangeViewStatusEnum,
  SupplierVendorsService,
  TaxIdRevealView,
  VendorView,
  VendorViewStatusEnum,
} from '@durion-sdk/supplier';
import { MAX_VENDOR_PAGES, SupplierVendorService, VENDOR_PAGE_SIZE } from './supplier-vendor.service';
import { SupplierVendorRoster } from '../models/supplier-profile.models';

const vendor = (n: number, status = VendorViewStatusEnum.Active): VendorView => ({
  vendorId: `vendor-${n}`,
  vendorNumber: `V-${String(n).padStart(6, '0')}`,
  displayName: `Vendor ${n}`,
  legalName: `Vendor ${n} Ltd`,
  status,
});

const page = (index: number, totalPages: number, items: VendorView[]): PagedResponseVendorView => ({
  items,
  page: index,
  size: VENDOR_PAGE_SIZE,
  totalPages,
  totalElements: totalPages * VENDOR_PAGE_SIZE,
});

describe('SupplierVendorService', () => {
  let service: SupplierVendorService;
  const vendorsSdk = {
    listSupplierVendors: vi.fn(),
    getSupplierVendor: vi.fn(),
    createSupplierVendor: vi.fn(),
    updateSupplierVendor: vi.fn(),
    deactivateSupplierVendor: vi.fn(),
    reactivateSupplierVendor: vi.fn(),
    listSupplierVendorRemitChanges: vi.fn(),
    requestSupplierVendorRemitChange: vi.fn(),
    approveSupplierVendorRemitChange: vi.fn(),
    rejectSupplierVendorRemitChange: vi.fn(),
    revealSupplierVendorTaxRegistration: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SupplierVendorService, { provide: SupplierVendorsService, useValue: vendorsSdk }],
    });
    service = TestBed.inject(SupplierVendorService);
  });

  afterEach(() => vi.clearAllMocks());

  const readRoster = (): SupplierVendorRoster | undefined => {
    let result: SupplierVendorRoster | undefined;
    service.listActiveVendors().subscribe(value => (result = value));
    return result;
  };

  it('listActiveVendors() asks for ACTIVE vendors at the largest page size', () => {
    vendorsSdk.listSupplierVendors.mockReturnValue(of(page(0, 1, [vendor(1)])));

    const result = readRoster();

    expect(vendorsSdk.listSupplierVendors).toHaveBeenCalledWith(undefined, 'ACTIVE', 0, VENDOR_PAGE_SIZE);
    expect(result).toEqual({
      vendors: [{ vendorId: 'vendor-1', vendorNumber: 'V-000001', displayName: 'Vendor 1', active: true }],
      truncated: false,
    });
  });

  it('listActiveVendors() reads every page, in order', () => {
    vendorsSdk.listSupplierVendors.mockImplementation(
      (_q: unknown, _status: unknown, index: number) => of(page(index, 3, [vendor(index + 1)])),
    );

    const result = readRoster();

    expect(vendorsSdk.listSupplierVendors).toHaveBeenCalledTimes(3);
    expect(result?.vendors.map(v => v.vendorId)).toEqual(['vendor-1', 'vendor-2', 'vendor-3']);
    expect(result?.truncated).toBe(false);
  });

  it('listActiveVendors() stops at the page bound and reports the roster as truncated', () => {
    vendorsSdk.listSupplierVendors.mockImplementation(
      (_q: unknown, _status: unknown, index: number) => of(page(index, MAX_VENDOR_PAGES + 5, [vendor(index)])),
    );

    const result = readRoster();

    expect(vendorsSdk.listSupplierVendors).toHaveBeenCalledTimes(MAX_VENDOR_PAGES);
    expect(result?.vendors).toHaveLength(MAX_VENDOR_PAGES);
    expect(result?.truncated).toBe(true);
  });

  it('listActiveVendors() stops on an empty page even if totalPages says more', () => {
    vendorsSdk.listSupplierVendors.mockReturnValue(of(page(0, 4, [])));

    const result = readRoster();

    expect(vendorsSdk.listSupplierVendors).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ vendors: [], truncated: false });
  });

  it('listActiveVendors() propagates a 403 for the picker to report as a permission problem', () => {
    vendorsSdk.listSupplierVendors.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));

    let error: unknown;
    service.listActiveVendors().subscribe({ error: (e: unknown) => (error = e) });

    expect((error as HttpErrorResponse).status).toBe(403);
  });

  it('getVendor() maps status to active/inactive', () => {
    vendorsSdk.getSupplierVendor.mockReturnValue(of(vendor(9, VendorViewStatusEnum.Inactive)));

    let result: unknown;
    service.getVendor('vendor-9').subscribe(value => (result = value));

    expect(vendorsSdk.getSupplierVendor).toHaveBeenCalledWith('vendor-9');
    expect(result).toEqual({ vendorId: 'vendor-9', vendorNumber: 'V-000009', displayName: 'Vendor 9', active: false });
  });

  // ── Vendor master (CAP:550 S30) ────────────────────────────────────────────

  const fullView: VendorView = {
    vendorId: 'v-1',
    vendorNumber: 'V-000123',
    legalName: 'Acme Tire Ltd',
    displayName: 'Acme Tire',
    status: VendorViewStatusEnum.Inactive,
    statusChangedAt: '2026-10-02T10:00:00Z',
    statusReason: 'Stopped trading with them',
    defaultPaymentTerms: 'NET30',
    defaultCurrency: 'USD',
    taxRegistrations: [{ registrationId: 'r-1', scheme: 'EIN', last4: '6789' }],
    remitTo: { payeeName: 'Acme', addressLine1: '1 Main St', city: 'Springfield', countryCode: 'US' },
    remitToVersion: 2,
    remitToChangedAt: '2026-10-01T12:00:00Z',
    remitToRequestedBy: 'clerk.a',
    remitToApprovedBy: 'controller.b',
    version: 7,
  };

  const changeView: RemitChangeView = {
    changeId: 'c-1',
    status: RemitChangeViewStatusEnum.Approved,
    proposedRemitTo: { payeeName: 'Acme', addressLine1: '9 New Rd' },
    reason: 'Vendor moved offices',
    requestedAt: '2026-10-08T09:00:00Z',
    requestedBy: 'clerk.a',
    decidedAt: '2026-10-08T10:00:00Z',
    decidedBy: 'controller.b',
    decisionNote: 'Called the vendor on file number',
    fromVersion: 1,
    toVersion: 2,
    vendorId: 'v-1',
  };

  const run = <T>(source: { subscribe: (next: (value: T) => void) => unknown }): T | undefined => {
    let value: T | undefined;
    source.subscribe(next => (value = next));
    return value;
  };

  it('listVendors() passes q, status, page and size and maps the page', () => {
    vendorsSdk.listSupplierVendors.mockReturnValue(of({ items: [fullView], page: 2, size: 50, totalElements: 101, totalPages: 3 }));

    const result = run(service.listVendors('acme', 'INACTIVE', 2, 50));

    expect(vendorsSdk.listSupplierVendors).toHaveBeenCalledWith('acme', 'INACTIVE', 2, 50);
    expect(result?.page).toBe(2);
    expect(result?.totalPages).toBe(3);
    expect(result?.totalElements).toBe(101);
    expect(result?.items[0]).toEqual({
      vendorId: 'v-1',
      vendorNumber: 'V-000123',
      legalName: 'Acme Tire Ltd',
      displayName: 'Acme Tire',
      status: 'INACTIVE',
      statusChangedAt: '2026-10-02T10:00:00Z',
      statusReason: 'Stopped trading with them',
      paymentTerms: 'NET30',
      currency: 'USD',
      taxRegistrations: [{ registrationId: 'r-1', scheme: 'EIN', region: null, last4: '6789' }],
      remitTo: {
        payeeName: 'Acme',
        addressLine1: '1 Main St',
        addressLine2: null,
        city: 'Springfield',
        region: null,
        postalCode: null,
        countryCode: 'US',
        remittanceEmail: null,
      },
      remitToVersion: 2,
      remitToChangedAt: '2026-10-01T12:00:00Z',
      remitToRequestedBy: 'clerk.a',
      remitToApprovedBy: 'controller.b',
      version: 7,
    });
  });

  it('getVendorDetail() reads one vendor; an empty remit-to maps to null', () => {
    vendorsSdk.getSupplierVendor.mockReturnValue(of({ ...fullView, remitTo: {} }));

    const result = run(service.getVendorDetail('v-1'));

    expect(vendorsSdk.getSupplierVendor).toHaveBeenCalledWith('v-1');
    expect(result?.remitTo).toBeNull();
  });

  it('createVendor() sends the S23 body, omitting a blank number and remit-to', () => {
    vendorsSdk.createSupplierVendor.mockReturnValue(of(fullView));

    const result = run(
      service.createVendor({
        legalName: 'Acme Tire Ltd',
        displayName: 'Acme Tire',
        paymentTerms: 'DUE_ON_RECEIPT',
        currency: 'USD',
        taxRegistrations: [{ scheme: 'EIN', number: '12-3456789' }],
      }),
    );

    expect(vendorsSdk.createSupplierVendor).toHaveBeenCalledWith({
      vendorNumber: undefined,
      legalName: 'Acme Tire Ltd',
      displayName: 'Acme Tire',
      defaultPaymentTerms: 'DUE_ON_RECEIPT',
      defaultCurrency: 'USD',
      taxRegistrations: [{ registrationId: undefined, scheme: 'EIN', region: undefined, number: '12-3456789' }],
      remitTo: undefined,
    });
    expect(result?.vendorNumber).toBe('V-000123');
  });

  it('updateVendor() sends version and keeps a stored registration by id without a number', () => {
    vendorsSdk.updateSupplierVendor.mockReturnValue(of(fullView));

    run(
      service.updateVendor('v-1', {
        legalName: 'Acme Tire Ltd',
        displayName: 'Acme',
        paymentTerms: 'NET45',
        currency: 'CAD',
        taxRegistrations: [{ registrationId: 'r-1', scheme: 'EIN' }],
        version: 7,
      }),
    );

    expect(vendorsSdk.updateSupplierVendor).toHaveBeenCalledWith('v-1', {
      legalName: 'Acme Tire Ltd',
      displayName: 'Acme',
      defaultPaymentTerms: 'NET45',
      defaultCurrency: 'CAD',
      taxRegistrations: [{ registrationId: 'r-1', scheme: 'EIN', region: undefined, number: undefined }],
      version: 7,
    });
  });

  it('deactivateVendor() and reactivateVendor() send the reason', () => {
    vendorsSdk.deactivateSupplierVendor.mockReturnValue(of(fullView));
    vendorsSdk.reactivateSupplierVendor.mockReturnValue(of({ ...fullView, status: VendorViewStatusEnum.Active }));

    expect(run(service.deactivateVendor('v-1', 'Stopped trading'))?.status).toBe('INACTIVE');
    expect(run(service.reactivateVendor('v-1', 'Trading again now'))?.status).toBe('ACTIVE');
    expect(vendorsSdk.deactivateSupplierVendor).toHaveBeenCalledWith('v-1', { reason: 'Stopped trading' });
    expect(vendorsSdk.reactivateSupplierVendor).toHaveBeenCalledWith('v-1', { reason: 'Trading again now' });
  });

  it('listRemitChanges() passes the optional status and maps each change', () => {
    vendorsSdk.listSupplierVendorRemitChanges.mockReturnValue(of([changeView]));

    const result = run(service.listRemitChanges('v-1', 'APPROVED'));

    expect(vendorsSdk.listSupplierVendorRemitChanges).toHaveBeenCalledWith('v-1', 'APPROVED');
    expect(result).toEqual([
      {
        changeId: 'c-1',
        status: 'APPROVED',
        proposedRemitTo: {
          payeeName: 'Acme',
          addressLine1: '9 New Rd',
          addressLine2: null,
          city: null,
          region: null,
          postalCode: null,
          countryCode: null,
          remittanceEmail: null,
        },
        reason: 'Vendor moved offices',
        requestedAt: '2026-10-08T09:00:00Z',
        requestedBy: 'clerk.a',
        decidedAt: '2026-10-08T10:00:00Z',
        decidedBy: 'controller.b',
        decisionNote: 'Called the vendor on file number',
        fromVersion: 1,
        toVersion: 2,
      },
    ]);
  });

  it('requestRemitChange() sends the proposed remit-to and reason', () => {
    vendorsSdk.requestSupplierVendorRemitChange.mockReturnValue(of({ ...changeView, status: RemitChangeViewStatusEnum.Pending }));

    const result = run(service.requestRemitChange('v-1', { payeeName: 'Acme', city: 'Springfield' }, 'Vendor moved offices'));

    expect(vendorsSdk.requestSupplierVendorRemitChange).toHaveBeenCalledWith('v-1', {
      remitTo: {
        payeeName: 'Acme',
        addressLine1: undefined,
        addressLine2: undefined,
        city: 'Springfield',
        region: undefined,
        postalCode: undefined,
        countryCode: undefined,
        remittanceEmail: undefined,
      },
      reason: 'Vendor moved offices',
    });
    expect(result?.status).toBe('PENDING');
  });

  it('approveRemitChange() sends the verification note; rejectRemitChange() sends the note', () => {
    vendorsSdk.approveSupplierVendorRemitChange.mockReturnValue(of(changeView));
    vendorsSdk.rejectSupplierVendorRemitChange.mockReturnValue(of({ ...changeView, status: RemitChangeViewStatusEnum.Rejected }));

    expect(run(service.approveRemitChange('v-1', 'c-1', 'Called the vendor'))?.status).toBe('APPROVED');
    expect(run(service.rejectRemitChange('v-1', 'c-1', 'Could not verify'))?.status).toBe('REJECTED');
    expect(vendorsSdk.approveSupplierVendorRemitChange).toHaveBeenCalledWith('v-1', 'c-1', { verificationNote: 'Called the vendor' });
    expect(vendorsSdk.rejectSupplierVendorRemitChange).toHaveBeenCalledWith('v-1', 'c-1', { note: 'Could not verify' });
  });

  it('revealTaxRegistration() sends the reason and returns the number to its caller only', () => {
    const revealed: TaxIdRevealView = { registrationId: 'r-1', scheme: 'EIN', number: '12-3456789' };
    vendorsSdk.revealSupplierVendorTaxRegistration.mockReturnValue(of(revealed));

    const result = run(service.revealTaxRegistration('v-1', 'r-1', 'Checking the W-9 form'));

    expect(vendorsSdk.revealSupplierVendorTaxRegistration).toHaveBeenCalledWith('v-1', 'r-1', { reason: 'Checking the W-9 form' });
    expect(result).toEqual({ registrationId: 'r-1', scheme: 'EIN', region: null, number: '12-3456789' });
  });
});
