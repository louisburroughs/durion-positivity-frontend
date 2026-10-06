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
  SupplierVendorsService,
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
  const vendorsSdk = { listSupplierVendors: vi.fn(), getSupplierVendor: vi.fn() };

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
});
