/**
 * SupplierVendorRosterService contract tests (ADR-0035 §9: the SDK's positional
 * arguments asserted in full; ADR-0032: fixtures typed as the SDK's view types).
 * Paging edge cases are also exercised through positivity's delegating
 * `SupplierVendorService` spec.
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PagedResponseVendorView, SupplierVendorsService, VendorView, VendorViewStatusEnum } from '@durion-sdk/supplier';
import { MAX_VENDOR_PAGES, SupplierVendorRosterService, VENDOR_PAGE_SIZE } from './supplier-vendor-roster.service';
import { SupplierVendorOption, SupplierVendorRoster } from '../models/supplier-vendor-roster.models';

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

describe('SupplierVendorRosterService', () => {
  let service: SupplierVendorRosterService;
  const vendorsSdk = { listSupplierVendors: vi.fn(), getSupplierVendor: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: SupplierVendorsService, useValue: vendorsSdk }] });
    service = TestBed.inject(SupplierVendorRosterService);
  });

  afterEach(() => vi.clearAllMocks());

  it('listActiveVendors() reads every page of ACTIVE vendors at the largest page size, in order', () => {
    vendorsSdk.listSupplierVendors.mockImplementation((_q: unknown, _status: unknown, index: number) =>
      of(page(index, 2, [vendor(index + 1)])),
    );

    let result: SupplierVendorRoster | undefined;
    service.listActiveVendors().subscribe(value => (result = value));

    expect(vendorsSdk.listSupplierVendors.mock.calls).toEqual([
      [undefined, 'ACTIVE', 0, VENDOR_PAGE_SIZE],
      [undefined, 'ACTIVE', 1, VENDOR_PAGE_SIZE],
    ]);
    expect(result).toEqual({
      vendors: [
        { vendorId: 'vendor-1', vendorNumber: 'V-000001', displayName: 'Vendor 1', active: true },
        { vendorId: 'vendor-2', vendorNumber: 'V-000002', displayName: 'Vendor 2', active: true },
      ],
      truncated: false,
    });
  });

  it('listActiveVendors() stops at the page bound and says the roster is truncated', () => {
    vendorsSdk.listSupplierVendors.mockImplementation((_q: unknown, _status: unknown, index: number) =>
      of(page(index, MAX_VENDOR_PAGES + 1, [vendor(index)])),
    );

    let result: SupplierVendorRoster | undefined;
    service.listActiveVendors().subscribe(value => (result = value));

    expect(vendorsSdk.listSupplierVendors).toHaveBeenCalledTimes(MAX_VENDOR_PAGES);
    expect(result?.truncated).toBe(true);
  });

  it('getVendor() reads one vendor by id and maps its status', () => {
    vendorsSdk.getSupplierVendor.mockReturnValue(of(vendor(9, VendorViewStatusEnum.Inactive)));

    let result: SupplierVendorOption | undefined;
    service.getVendor('vendor-9').subscribe(value => (result = value));

    expect(vendorsSdk.getSupplierVendor).toHaveBeenCalledWith('vendor-9');
    expect(result).toEqual({ vendorId: 'vendor-9', vendorNumber: 'V-000009', displayName: 'Vendor 9', active: false });
  });
});
