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
 * The vendor master pages (CAP:550 S30, #469) use the rest of the service:
 *
 *   listVendors / getVendorDetail          supplier:vendor:read
 *   createVendor / updateVendor            supplier:vendor:write
 *   deactivateVendor / reactivateVendor    supplier:vendor:write
 *   listRemitChanges                       supplier:vendor:read
 *   requestRemitChange                     supplier:vendor:write
 *   approveRemitChange / rejectRemitChange supplier:vendor_remit:approve
 *   revealTaxRegistration                  supplier:vendor_tax_id:reveal (#2621)
 *
 * Tax-registration numbers are RESTRICTED (ADR-0072): reads return them masked,
 * and the one revealed number is returned to its caller and never kept, cached
 * or logged here. S23's commands carry no idempotency key, so nothing here
 * retries a write.
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
  RemitChangeView,
  RemitChangeViewStatusEnum,
  RemitToDto,
  SupplierVendorsService,
  TaxRegistrationDto,
  TaxRegistrationView,
  VendorView,
  VendorViewStatusEnum,
} from '@durion-sdk/supplier';
import { SupplierVendorOption, SupplierVendorRoster } from '../models/supplier-profile.models';
import {
  RemitChangeStatus,
  RemitTo,
  RemitToChange,
  RemitToInput,
  RevealedTaxRegistration,
  TaxRegistration,
  TaxRegistrationInput,
  Vendor,
  VendorCreateInput,
  VendorPage,
  VendorStatus,
  VendorUpdateInput,
} from '../models/supplier-vendor.models';

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

  /** One page of vendors, optionally narrowed by `q` (number or name) and status. */
  listVendors(q: string | undefined, status: VendorStatus | undefined, page: number, size: number): Observable<VendorPage> {
    return this.vendorsSdk.listSupplierVendors(q, status, page, size).pipe(
      map(response => ({
        items: (response.items ?? []).map(view => toVendor(view)),
        page: response.page ?? page,
        size: response.size ?? size,
        totalElements: response.totalElements ?? 0,
        totalPages: response.totalPages ?? 0,
      })),
    );
  }

  /** The vendor with its masked registrations and approved remit-to. */
  getVendorDetail(vendorId: string): Observable<Vendor> {
    return this.vendorsSdk.getSupplierVendor(vendorId).pipe(map(view => toVendor(view)));
  }

  createVendor(input: VendorCreateInput): Observable<Vendor> {
    return this.vendorsSdk
      .createSupplierVendor({
        vendorNumber: input.vendorNumber,
        legalName: input.legalName,
        displayName: input.displayName,
        defaultPaymentTerms: input.paymentTerms,
        defaultCurrency: input.currency,
        taxRegistrations: input.taxRegistrations.map(toTaxRegistrationDto),
        remitTo: input.remitTo ? toRemitToDto(input.remitTo) : undefined,
      })
      .pipe(map(view => toVendor(view)));
  }

  updateVendor(vendorId: string, input: VendorUpdateInput): Observable<Vendor> {
    return this.vendorsSdk
      .updateSupplierVendor(vendorId, {
        legalName: input.legalName,
        displayName: input.displayName,
        defaultPaymentTerms: input.paymentTerms,
        defaultCurrency: input.currency,
        taxRegistrations: input.taxRegistrations.map(toTaxRegistrationDto),
        version: input.version,
      })
      .pipe(map(view => toVendor(view)));
  }

  deactivateVendor(vendorId: string, reason: string): Observable<Vendor> {
    return this.vendorsSdk.deactivateSupplierVendor(vendorId, { reason }).pipe(map(view => toVendor(view)));
  }

  reactivateVendor(vendorId: string, reason: string): Observable<Vendor> {
    return this.vendorsSdk.reactivateSupplierVendor(vendorId, { reason }).pipe(map(view => toVendor(view)));
  }

  /** Every remit-to change of the vendor, newest first, or only those in `status`. */
  listRemitChanges(vendorId: string, status?: RemitChangeStatus): Observable<RemitToChange[]> {
    return this.vendorsSdk
      .listSupplierVendorRemitChanges(vendorId, status)
      .pipe(map(views => (views ?? []).map(view => toRemitChange(view))));
  }

  requestRemitChange(vendorId: string, remitTo: RemitToInput, reason: string): Observable<RemitToChange> {
    return this.vendorsSdk
      .requestSupplierVendorRemitChange(vendorId, { remitTo: toRemitToDto(remitTo), reason })
      .pipe(map(view => toRemitChange(view)));
  }

  approveRemitChange(vendorId: string, changeId: string, verificationNote: string): Observable<RemitToChange> {
    return this.vendorsSdk
      .approveSupplierVendorRemitChange(vendorId, changeId, { verificationNote })
      .pipe(map(view => toRemitChange(view)));
  }

  rejectRemitChange(vendorId: string, changeId: string, note: string): Observable<RemitToChange> {
    return this.vendorsSdk
      .rejectSupplierVendorRemitChange(vendorId, changeId, { note })
      .pipe(map(view => toRemitChange(view)));
  }

  /** One registration's full number, after the server records the reveal. RESTRICTED: never keep it. */
  revealTaxRegistration(vendorId: string, registrationId: string, reason: string): Observable<RevealedTaxRegistration> {
    return this.vendorsSdk.revealSupplierVendorTaxRegistration(vendorId, registrationId, { reason }).pipe(
      map(view => ({
        registrationId: view.registrationId,
        scheme: view.scheme,
        region: view.region ?? null,
        number: view.number,
      })),
    );
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

function text(value: string | null | undefined): string | null {
  return value?.trim() ? value : null;
}

function toRemitTo(dto: RemitToDto | undefined): RemitTo | null {
  if (!dto) return null;
  const remitTo: RemitTo = {
    payeeName: text(dto.payeeName),
    addressLine1: text(dto.addressLine1),
    addressLine2: text(dto.addressLine2),
    city: text(dto.city),
    region: text(dto.region),
    postalCode: text(dto.postalCode),
    countryCode: text(dto.countryCode),
    remittanceEmail: text(dto.remittanceEmail),
  };
  return Object.values(remitTo).some(value => value !== null) ? remitTo : null;
}

function toRemitToDto(input: RemitToInput): RemitToDto {
  return {
    payeeName: input.payeeName,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    city: input.city,
    region: input.region,
    postalCode: input.postalCode,
    countryCode: input.countryCode,
    remittanceEmail: input.remittanceEmail,
  };
}

function toTaxRegistration(view: TaxRegistrationView): TaxRegistration {
  return { registrationId: view.registrationId, scheme: view.scheme, region: text(view.region), last4: text(view.last4) };
}

/** `registrationId` without `number` keeps the stored number (#2621); a new one carries its number. */
function toTaxRegistrationDto(input: TaxRegistrationInput): TaxRegistrationDto {
  return { registrationId: input.registrationId, scheme: input.scheme, region: input.region, number: input.number };
}

function toVendor(view: VendorView): Vendor {
  return {
    vendorId: view.vendorId ?? '',
    vendorNumber: view.vendorNumber ?? '',
    legalName: view.legalName ?? '',
    displayName: view.displayName ?? '',
    status: view.status === VendorViewStatusEnum.Inactive ? 'INACTIVE' : 'ACTIVE',
    statusChangedAt: view.statusChangedAt ?? null,
    statusReason: text(view.statusReason),
    paymentTerms: text(view.defaultPaymentTerms),
    currency: text(view.defaultCurrency),
    taxRegistrations: (view.taxRegistrations ?? []).map(toTaxRegistration),
    remitTo: toRemitTo(view.remitTo),
    remitToVersion: view.remitToVersion ?? 0,
    remitToChangedAt: view.remitToChangedAt ?? null,
    remitToRequestedBy: text(view.remitToRequestedBy),
    remitToApprovedBy: text(view.remitToApprovedBy),
    version: view.version ?? null,
  };
}

function toRemitStatus(status: RemitChangeViewStatusEnum | undefined): RemitChangeStatus {
  if (status === RemitChangeViewStatusEnum.Approved) return 'APPROVED';
  return status === RemitChangeViewStatusEnum.Rejected ? 'REJECTED' : 'PENDING';
}

function toRemitChange(view: RemitChangeView): RemitToChange {
  return {
    changeId: view.changeId ?? '',
    status: toRemitStatus(view.status),
    proposedRemitTo: toRemitTo(view.proposedRemitTo),
    reason: text(view.reason),
    requestedAt: view.requestedAt ?? null,
    requestedBy: text(view.requestedBy),
    decidedAt: view.decidedAt ?? null,
    decidedBy: text(view.decidedBy),
    decisionNote: text(view.decisionNote),
    fromVersion: view.fromVersion ?? null,
    toVersion: view.toVersion ?? null,
  };
}
