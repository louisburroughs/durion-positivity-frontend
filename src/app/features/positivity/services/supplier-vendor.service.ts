/**
 * Vendor reads for the supplier-profile form's vendor picker (#484).
 *
 * Since backend S23 (#2516) every supplier profile belongs to one pos-supplier
 * vendor and `vendorId` is required on profile create and update. The picker
 * needs two reads, both from `SupplierVendorsService` in `@durion-sdk/supplier`
 * and both gated by `supplier:vendor:read`:
 *
 *   listSupplierVendors(status=ACTIVE)   the vendors a profile may be pointed at
 *   getSupplierVendor(vendorId)          the profile's own vendor, to learn its status
 *
 * Vendor master pages (create, deactivate, remit-to) are out of scope here.
 *
 * ── Paging ───────────────────────────────────────────────────────────────────
 * The list endpoint is paged (size 1..200). A picker that showed only the first
 * page would silently hide vendors, so every page is read — up to
 * `MAX_VENDOR_PAGES` pages — and the roster reports `truncated` when the tenant
 * has more than that, for the picker to say so.
 */
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';
import { expand, map, reduce } from 'rxjs/operators';
import {
  PagedResponseVendorView,
  SupplierVendorsService,
  VendorView,
  VendorViewStatusEnum,
} from '@durion-sdk/supplier';
import { SupplierVendorOption, SupplierVendorRoster } from '../models/supplier-profile.models';

/** Largest page the list endpoint accepts. */
export const VENDOR_PAGE_SIZE = 200;
/** Upper bound on pages read for one roster (2,000 vendors at the maximum page size). */
export const MAX_VENDOR_PAGES = 10;

interface PageResult {
  readonly index: number;
  readonly page: PagedResponseVendorView;
}

@Injectable({ providedIn: 'root' })
export class SupplierVendorService {
  private readonly vendorsSdk = inject(SupplierVendorsService);

  /** Every ACTIVE vendor of the caller's tenant, in vendor-number order, read up to the page bound. */
  listActiveVendors(): Observable<SupplierVendorRoster> {
    const readPage = (index: number): Observable<PageResult> =>
      this.vendorsSdk
        .listSupplierVendors(undefined, VendorViewStatusEnum.Active, index, VENDOR_PAGE_SIZE)
        .pipe(map(page => ({ index, page })));

    return readPage(0).pipe(
      expand(result => {
        const next = result.index + 1;
        return this.hasMore(result) && next < MAX_VENDOR_PAGES ? readPage(next) : EMPTY;
      }),
      reduce(
        (roster: SupplierVendorRoster, result: PageResult) => ({
          vendors: [...roster.vendors, ...(result.page.items ?? []).map(view => this.toOption(view))],
          truncated: this.hasMore(result) && result.index + 1 >= MAX_VENDOR_PAGES,
        }),
        { vendors: [], truncated: false },
      ),
    );
  }

  /** One vendor by id — used to learn whether a profile's current vendor is still active. */
  getVendor(vendorId: string): Observable<SupplierVendorOption> {
    return this.vendorsSdk.getSupplierVendor(vendorId).pipe(map(view => this.toOption(view)));
  }

  private hasMore(result: PageResult): boolean {
    const totalPages = result.page.totalPages ?? 0;
    const items = result.page.items ?? [];
    return items.length > 0 && result.index + 1 < totalPages;
  }

  private toOption(view: VendorView): SupplierVendorOption {
    return {
      vendorId: view.vendorId ?? '',
      vendorNumber: view.vendorNumber ?? '',
      displayName: view.displayName ?? '',
      active: view.status === VendorViewStatusEnum.Active,
    };
  }
}
