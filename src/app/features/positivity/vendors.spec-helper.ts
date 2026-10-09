/**
 * Typed fixtures and doubles for the vendor page specs (CAP:550 S30).
 * `*.spec-helper.ts` is excluded from the app build.
 */
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';
import { JwtClaims } from '../../core/models/auth.models';
import { AuthService } from '../../core/services/auth.service';
import { VendorProfileSummary } from './models/supplier-profile.models';
import { RemitTo, RemitToChange, Vendor, VendorPage } from './models/supplier-vendor.models';
import { SupplierProfileService } from './services/supplier-profile.service';
import { SupplierVendorService } from './services/supplier-vendor.service';

export const VENDOR_ID = '0192a4c2-0000-7000-8000-000000000001';
export const CHANGE_ID = '0192a4c2-0000-7000-8000-0000000000c1';
export const UUID_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export const ALL_VENDOR_CODES = [
  'supplier:vendor:read',
  'supplier:vendor:write',
  'supplier:vendor_remit:approve',
  'supplier:vendor_tax_id:reveal',
  'supplier:profile:read',
];

export const REMIT: RemitTo = {
  payeeName: 'Acme Tire Ltd',
  addressLine1: '1 Main St',
  addressLine2: null,
  city: 'Springfield',
  region: 'IL',
  postalCode: '62701',
  countryCode: 'US',
  remittanceEmail: 'ap@acme.example',
};

export const NEW_REMIT: RemitTo = {
  payeeName: 'Acme Tire Ltd',
  addressLine1: '99 New Rd',
  addressLine2: 'Suite 4',
  city: 'Shelbyville',
  region: 'IL',
  postalCode: '62565',
  countryCode: 'US',
  remittanceEmail: null,
};

export function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    vendorId: VENDOR_ID,
    vendorNumber: 'V-000123',
    legalName: 'Acme Tire Ltd',
    displayName: 'Acme Tire',
    status: 'ACTIVE',
    statusChangedAt: null,
    statusReason: null,
    paymentTerms: 'NET30',
    currency: 'USD',
    taxRegistrations: [{ registrationId: '0192a4c2-0000-7000-8000-0000000000t1', scheme: 'EIN', region: null, last4: '6789' }],
    remitTo: REMIT,
    remitToVersion: 1,
    remitToChangedAt: '2026-10-01T12:00:00Z',
    remitToRequestedBy: 'clerk.a',
    remitToApprovedBy: null,
    version: 3,
    ...overrides,
  };
}

export function change(overrides: Partial<RemitToChange> = {}): RemitToChange {
  return {
    changeId: CHANGE_ID,
    status: 'PENDING',
    proposedRemitTo: NEW_REMIT,
    reason: 'Vendor moved offices last week',
    requestedAt: '2026-10-08T09:00:00Z',
    requestedBy: 'clerk.a',
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    fromVersion: 1,
    toVersion: null,
    ...overrides,
  };
}

export function vendorPage(items: Vendor[], overrides: Partial<VendorPage> = {}): VendorPage {
  return { items, page: 0, size: 50, totalElements: items.length, totalPages: items.length ? 1 : 0, ...overrides };
}

export function profileSummary(overrides: Partial<VendorProfileSummary> = {}): VendorProfileSummary {
  return {
    vendorProfileId: '0192a4c2-0000-7000-8000-0000000000p1',
    supplierRef: 'acme-edi',
    displayName: 'Acme EDI',
    enabled: true,
    sandbox: false,
    sourceOfTruth: 'ADMIN',
    vendorId: VENDOR_ID,
    vendorNumber: 'V-000123',
    vendorDisplayName: 'Acme Tire',
    ...overrides,
  };
}

export function httpError(status: number, code?: string, extra: Record<string, unknown> = {}): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: code ? { code, message: 'server text', ...extra } : null });
}

/**
 * AuthService double. `permissions === null` models a token without `perm_bits`
 * (permissions unknown); a set models a decoded grant.
 */
export class VendorAuthStub {
  readonly claims = signal<Partial<JwtClaims> | null>({ sub: 'clerk.b' });
  readonly tenant = signal<string | null>('tenant-1');
  readonly permissions = signal<ReadonlySet<string> | null>(new Set(ALL_VENDOR_CODES));
  readonly roles = signal<readonly string[]>([]);

  readonly currentUserClaims = () => this.claims();
  readonly tenantId = () => this.tenant();
  readonly isAuthenticated = () => true;
  readonly permissionsKnown = () => this.permissions() !== null;
  readonly hasPermission = (code: string) => this.permissions()?.has(code) ?? false;
  readonly hasAnyPermission = (codes: readonly string[]) => codes.some(code => this.hasPermission(code));
  readonly hasAnyRole = (roles: readonly string[]) => roles.some(role => this.roles().includes(role));

  grant(...codes: string[]): void {
    this.permissions.set(new Set(codes));
  }
}

type Fn<A extends unknown[], R> = ReturnType<typeof vi.fn<(...args: A) => R>>;

export interface VendorServiceMock {
  listVendors: Fn<[string | undefined, string | undefined, number, number], Observable<VendorPage>>;
  getVendorDetail: Fn<[string], Observable<Vendor>>;
  createVendor: Fn<[unknown], Observable<Vendor>>;
  updateVendor: Fn<[string, unknown], Observable<Vendor>>;
  deactivateVendor: Fn<[string, string], Observable<Vendor>>;
  reactivateVendor: Fn<[string, string], Observable<Vendor>>;
  listRemitChanges: Fn<[string, string?], Observable<RemitToChange[]>>;
  requestRemitChange: Fn<[string, unknown, string], Observable<RemitToChange>>;
  approveRemitChange: Fn<[string, string, string], Observable<RemitToChange>>;
  rejectRemitChange: Fn<[string, string, string], Observable<RemitToChange>>;
  revealTaxRegistration: Fn<[string, string, string], Observable<unknown>>;
}

export function vendorServiceMock(current: Vendor = vendor(), changes: RemitToChange[] = []): VendorServiceMock {
  return {
    listVendors: vi.fn(() => of(vendorPage([current]))),
    getVendorDetail: vi.fn(() => of(current)),
    createVendor: vi.fn(() => of(current)),
    updateVendor: vi.fn(() => of(current)),
    deactivateVendor: vi.fn(() => of({ ...current, status: 'INACTIVE' as const })),
    reactivateVendor: vi.fn(() => of({ ...current, status: 'ACTIVE' as const })),
    listRemitChanges: vi.fn(() => of(changes)),
    requestRemitChange: vi.fn(() => of(change())),
    approveRemitChange: vi.fn(() => of(change({ status: 'APPROVED' }))),
    rejectRemitChange: vi.fn(() => of(change({ status: 'REJECTED' }))),
    revealTaxRegistration: vi.fn(() =>
      of({ registrationId: '0192a4c2-0000-7000-8000-0000000000t1', scheme: 'EIN', region: null, number: '12-3456789' }),
    ),
  };
}

export function profileServiceMock(profiles: VendorProfileSummary[] = [profileSummary()]) {
  return { listProfiles: vi.fn(() => of(profiles)) };
}

export function vendorProviders(service: VendorServiceMock, auth: VendorAuthStub, profiles = profileServiceMock()) {
  return [
    { provide: SupplierVendorService, useValue: service },
    { provide: SupplierProfileService, useValue: profiles },
    { provide: AuthService, useValue: auth },
  ];
}

/** Sets a text control's value as a person typing would. */
export function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): void {
  if (!element) throw new Error('missing control');
  element.value = value;
  element.dispatchEvent(new Event('input'));
}
