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
 * The picker's two reads (the paged ACTIVE roster and one vendor's status) are
 * `SupplierVendorRosterService`'s, shared with the purchase-order form's picker
 * (CAP:550, #514); this service delegates to it.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
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
import { SupplierVendorRosterService } from '../../../shared/supplier-vendors/services/supplier-vendor-roster.service';
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

export { MAX_VENDOR_PAGES, VENDOR_PAGE_SIZE } from '../../../shared/supplier-vendors/services/supplier-vendor-roster.service';

@Injectable({ providedIn: 'root' })
export class SupplierVendorService {
  private readonly vendorsSdk = inject(SupplierVendorsService);
  private readonly roster = inject(SupplierVendorRosterService);

  /** Every ACTIVE vendor of the caller's tenant, in vendor-number order, read up to the page bound. */
  listActiveVendors(): Observable<SupplierVendorRoster> {
    return this.roster.listActiveVendors();
  }

  /** One vendor by id — used to learn whether a profile's current vendor is still active. */
  getVendor(vendorId: string): Observable<SupplierVendorOption> {
    return this.roster.getVendor(vendorId);
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
