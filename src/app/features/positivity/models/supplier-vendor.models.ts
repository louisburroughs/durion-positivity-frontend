/**
 * Vendor master models (CAP:550 S30, louisburroughs/durion-positivity-frontend#469),
 * mirroring backend S23's `@durion-sdk/supplier` vendor views (#2516) with the
 * masked tax registrations of #2621.
 *
 * `vendorId` and `changeId` are identities for routes and calls only; they never
 * render as text (P8, ADR-0064 §5). `vendorNumber` is the reference people see.
 *
 * Tax-registration numbers are RESTRICTED (ADR-0072, backend #2617 ruling 1):
 * no read model here carries one. A number exists only in a form a person is
 * typing, and in the reveal dialog while it is open.
 */

export type VendorStatus = 'ACTIVE' | 'INACTIVE';
export type RemitChangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
/** The list's status filter: one status, or every vendor. */
export type VendorStatusFilter = VendorStatus | 'ALL';

/** Reasons, notes and verification notes: at least this many characters once trimmed (S23). */
export const VENDOR_NOTE_MIN = 10;
/** …and at most this many (S23 `VendorFields.MAX_NOTE_LENGTH`). */
export const VENDOR_NOTE_MAX = 1000;
/** Upper bound the reveal endpoint accepts for its reason (#2621). */
export const VENDOR_REVEAL_REASON_MAX = 500;
/** Net terms run from 1 to 120 days (`NET1` … `NET120`). */
export const VENDOR_NET_DAYS_MIN = 1;
export const VENDOR_NET_DAYS_MAX = 120;
/** Page size of the vendor list (the endpoint's default). */
export const VENDOR_LIST_PAGE_SIZE = 50;

/** The postal address a vendor is paid at. Never carries bank details (OI-14). */
export interface RemitTo {
  readonly payeeName: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly remittanceEmail: string | null;
}

/** One tax registration, masked: never the number (#2621). */
export interface TaxRegistration {
  readonly registrationId: string;
  readonly scheme: string;
  readonly region: string | null;
  /** Last four characters; null when the number is shorter than 8 ("on file"). */
  readonly last4: string | null;
}

export interface Vendor {
  readonly vendorId: string;
  readonly vendorNumber: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly status: VendorStatus;
  /** @serverGenerated */
  readonly statusChangedAt?: string | null;
  /** @serverGenerated */
  readonly statusReason: string | null;
  /** `DUE_ON_RECEIPT` or `NET<n>`. */
  readonly paymentTerms: string | null;
  readonly currency: string | null;
  readonly taxRegistrations: readonly TaxRegistration[];
  readonly remitTo: RemitTo | null;
  /** @serverGenerated 0 with no remit-to, 1 when given at creation, +1 per approved change. */
  readonly remitToVersion: number;
  /** @serverGenerated */
  readonly remitToChangedAt?: string | null;
  /** @serverGenerated */
  readonly remitToRequestedBy: string | null;
  /** @serverGenerated */
  readonly remitToApprovedBy: string | null;
  /** @serverGenerated optimistic-lock version, sent back on update. */
  readonly version: number | null;
}

export interface VendorPage {
  readonly items: readonly Vendor[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

export interface RemitToChange {
  readonly changeId: string;
  readonly status: RemitChangeStatus;
  readonly proposedRemitTo: RemitTo | null;
  readonly reason: string | null;
  /** @serverGenerated */
  readonly requestedAt?: string | null;
  /** @serverGenerated the requester's username (the JWT `sub`). */
  readonly requestedBy: string | null;
  /** @serverGenerated */
  readonly decidedAt?: string | null;
  /** @serverGenerated */
  readonly decidedBy: string | null;
  /** @serverGenerated */
  readonly decisionNote: string | null;
  /** @serverGenerated */
  readonly fromVersion: number | null;
  /** @serverGenerated */
  readonly toVersion: number | null;
}

/** A registration as a form sends it: `registrationId` without `number` keeps the stored one. */
export interface TaxRegistrationInput {
  readonly registrationId?: string;
  readonly scheme: string;
  readonly region?: string;
  readonly number?: string;
}

export interface RemitToInput {
  readonly payeeName?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly remittanceEmail?: string;
}

/** `POST /v1/supplier/vendors`. `vendorNumber` omitted means "number it for me". */
export interface VendorCreateInput {
  readonly vendorNumber?: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly paymentTerms: string;
  readonly currency: string;
  readonly taxRegistrations: readonly TaxRegistrationInput[];
  readonly remitTo?: RemitToInput;
}

/** `PUT /v1/supplier/vendors/{vendorId}`: every field but number, remit-to and status. */
export interface VendorUpdateInput {
  readonly legalName: string;
  readonly displayName: string;
  readonly paymentTerms: string;
  readonly currency: string;
  readonly taxRegistrations: readonly TaxRegistrationInput[];
  readonly version: number;
}

/** A revealed number. RESTRICTED: held only by the open reveal dialog, never cached or logged. */
export interface RevealedTaxRegistration {
  readonly registrationId: string;
  readonly scheme: string;
  readonly region: string | null;
  readonly number: string;
}

