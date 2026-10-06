/**
 * Test doubles shared by the vendor picker spec and the profile page specs that
 * render it. `*.spec-helper.ts` is excluded from the app build.
 */
import { signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';
import { JwtClaims } from '../../../../core/models/auth.models';
import { AuthService } from '../../../../core/services/auth.service';
import { SupplierVendorOption, SupplierVendorRoster } from '../../models/supplier-profile.models';
import { SupplierVendorService } from '../../services/supplier-vendor.service';

export const ACME: SupplierVendorOption = {
  vendorId: 'ffc9a4c2-0000-7000-8000-00000000v001',
  vendorNumber: 'V-000001',
  displayName: 'Acme Tire',
  active: true,
};

export const BOLT: SupplierVendorOption = {
  vendorId: 'ffc9a4c2-0000-7000-8000-00000000v002',
  vendorNumber: 'V-000002',
  displayName: 'Bolt Wheels',
  active: true,
};

export const RETIRED: SupplierVendorOption = {
  vendorId: 'ffc9a4c2-0000-7000-8000-00000000v009',
  vendorNumber: 'V-000009',
  displayName: 'Retired Rubber',
  active: false,
};

export function roster(...vendors: SupplierVendorOption[]): SupplierVendorRoster {
  return { vendors, truncated: false };
}

export interface VendorServiceStub {
  listActiveVendors: ReturnType<typeof vi.fn<() => Observable<SupplierVendorRoster>>>;
  getVendor: ReturnType<typeof vi.fn<(vendorId: string) => Observable<SupplierVendorOption>>>;
}

export function vendorServiceStub(
  active: SupplierVendorRoster = roster(ACME, BOLT),
  byId: readonly SupplierVendorOption[] = [ACME, BOLT, RETIRED],
): VendorServiceStub {
  return {
    listActiveVendors: vi.fn(() => of(active)),
    getVendor: vi.fn((vendorId: string) => {
      const found = byId.find(vendor => vendor.vendorId === vendorId);
      return of(found ?? { vendorId, vendorNumber: '', displayName: '', active: false });
    }),
  };
}

/**
 * AuthService double. `permissions === null` models a token without `perm_bits`
 * (permissions unknown); a set models a decoded grant.
 */
export class AuthStub {
  readonly claims = signal<Partial<JwtClaims> | null>({ sub: 'clerk.a' });
  readonly tenant = signal<string | null>('tenant-1');
  readonly permissions = signal<ReadonlySet<string> | null>(
    new Set(['supplier:profile:read', 'supplier:profile:write', 'supplier:vendor:read']),
  );

  readonly currentUserClaims = () => this.claims();
  readonly tenantId = () => this.tenant();
  readonly permissionsKnown = () => this.permissions() !== null;
  readonly hasPermission = (code: string) => this.permissions()?.has(code) ?? false;
  readonly hasAnyPermission = (codes: readonly string[]) => codes.some(code => this.hasPermission(code));
}

export function vendorPickerProviders(service: VendorServiceStub, auth: AuthStub = new AuthStub()) {
  return [
    { provide: SupplierVendorService, useValue: service },
    { provide: AuthService, useValue: auth },
  ];
}
