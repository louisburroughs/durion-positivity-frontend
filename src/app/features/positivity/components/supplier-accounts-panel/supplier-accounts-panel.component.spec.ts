import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierAccountsPanelComponent } from './supplier-accounts-panel.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import {
  SupplierAccounts,
  SupplierApiErrorBody,
  SupplierDeliveryAccount,
} from '../../models/supplier-profile.models';

const PROFILE_ID = 'profile-1';

const springfield: SupplierDeliveryAccount = {
  locationId: 'loc-1',
  locationName: 'Springfield Main',
  accountNumber: '4711-01',
  agencyCode: 'A1',
};

const fullyMapped: SupplierAccounts = {
  billing: { accountNumber: '4711', agencyCode: 'A1' },
  delivery: [springfield],
  activeLocations: [{ locationId: 'loc-1', name: 'Springfield Main' }],
};

const withGap: SupplierAccounts = {
  billing: { accountNumber: '4711', agencyCode: 'A1' },
  delivery: [springfield],
  activeLocations: [
    { locationId: 'loc-1', name: 'Springfield Main' },
    { locationId: 'loc-2', name: 'Shelbyville Depot' },
    { locationId: 'loc-3', name: 'Ogdenville Yard' },
  ],
};

function httpError(status: number, body?: SupplierApiErrorBody): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'x', error: body ?? null });
}

describe('SupplierAccountsPanelComponent', () => {
  let fixture: ComponentFixture<SupplierAccountsPanelComponent>;
  let component: SupplierAccountsPanelComponent;
  let service: {
    getAccounts: ReturnType<typeof vi.fn>;
    updateBillingAccount: ReturnType<typeof vi.fn>;
    upsertDeliveryAccount: ReturnType<typeof vi.fn>;
    deleteDeliveryAccount: ReturnType<typeof vi.fn>;
  };

  async function setup(
    accounts: SupplierAccounts | HttpErrorResponse = fullyMapped,
  ): Promise<void> {
    service = {
      getAccounts: vi
        .fn()
        .mockReturnValue(
          accounts instanceof HttpErrorResponse ? throwError(() => accounts) : of(accounts),
        ),
      updateBillingAccount: vi.fn().mockReturnValue(of(fullyMapped.billing)),
      upsertDeliveryAccount: vi.fn().mockReturnValue(of(springfield)),
      deleteDeliveryAccount: vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierAccountsPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierProfileService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierAccountsPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('vendorProfileId', PROFILE_ID);
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the accounts for the profile', async () => {
    await setup();

    expect(service.getAccounts).toHaveBeenCalledWith(PROFILE_ID);
    expect(component.state()).toBe('ready');
    expect(component.billingForm.getRawValue().accountNumber).toBe('4711');
  });

  it('sets both state and errorKey when the load fails', async () => {
    await setup(httpError(500));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without account data on 403', async () => {
    await setup(httpError(403));

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).toBeNull();
  });

  // ── Delivery mapping gaps ──────────────────────────────────────────────────

  it('flags active locations with no delivery mapping and names each one', async () => {
    await setup(withGap);

    expect(component.hasMappingGap()).toBe(true);
    expect(component.unmappedLocations().map(l => l.locationId)).toEqual(['loc-2', 'loc-3']);

    const banner = (fixture.nativeElement as HTMLElement).querySelector('.pos-banner--warning');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.textContent).toContain('Shelbyville Depot');
    expect(banner?.textContent).toContain('Ogdenville Yard');
  });

  it('raises no mapping warning when every active location is mapped', async () => {
    await setup(fullyMapped);

    expect(component.hasMappingGap()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-banner--warning')).toBeNull();
  });

  it('pre-selects the location when the admin acts on a flagged gap', async () => {
    await setup(withGap);
    component.startMapLocation(component.unmappedLocations()[0]);

    expect(component.deliveryFormOpen()).toBe(true);
    expect(component.deliveryForm.getRawValue().locationId).toBe('loc-2');
  });

  it('offers only unmapped locations when adding, plus the one being edited', async () => {
    await setup(withGap);

    component.startAddDelivery();
    expect(component.selectableLocations().map(l => l.locationId)).toEqual(['loc-2', 'loc-3']);

    component.startEditDelivery(springfield);
    expect(component.selectableLocations().map(l => l.locationId)).toEqual([
      'loc-1',
      'loc-2',
      'loc-3',
    ]);
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  it('saves the billing account with number and agency code', async () => {
    await setup();
    component.billingForm.patchValue({ accountNumber: '9000', agencyCode: 'B2' });
    component.saveBilling();

    expect(service.updateBillingAccount).toHaveBeenCalledWith(PROFILE_ID, {
      accountNumber: '9000',
      agencyCode: 'B2',
    });
  });

  it('omits a blank agency code rather than sending an empty string', async () => {
    await setup();
    component.billingForm.patchValue({ accountNumber: '9000', agencyCode: '  ' });
    component.saveBilling();

    expect(service.updateBillingAccount).toHaveBeenCalledWith(PROFILE_ID, {
      accountNumber: '9000',
      agencyCode: undefined,
    });
  });

  it('upserts a delivery mapping for the chosen location', async () => {
    await setup(withGap);
    component.startAddDelivery();
    component.deliveryForm.patchValue({
      locationId: 'loc-2',
      accountNumber: '4711-02',
      agencyCode: 'A1',
    });
    component.saveDelivery();

    expect(service.upsertDeliveryAccount).toHaveBeenCalledWith(PROFILE_ID, {
      locationId: 'loc-2',
      accountNumber: '4711-02',
      agencyCode: 'A1',
    });
  });

  it('maps a malformed location UUID 400 to the locationId field with state and errorKey set', async () => {
    await setup(withGap);
    service.upsertDeliveryAccount.mockReturnValue(
      throwError(() =>
        httpError(400, { fieldErrors: [{ field: 'locationId', code: 'LOCATION_UUID_MALFORMED' }] }),
      ),
    );
    component.startAddDelivery();
    component.deliveryForm.patchValue({ locationId: 'not-a-uuid', accountNumber: '1' });
    component.saveDelivery();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('locationId')).toBe(
      'POSITIVITY.ERROR.FIELD.LOCATION_UUID_MALFORMED',
    );
  });

  it('maps a billing 400 to the account number field with state and errorKey set', async () => {
    await setup();
    service.updateBillingAccount.mockReturnValue(
      throwError(() =>
        httpError(400, {
          fieldErrors: [{ field: 'accountNumber', code: 'ACCOUNT_NUMBER_REQUIRED' }],
        }),
      ),
    );
    component.billingForm.patchValue({ accountNumber: 'x' });
    component.saveBilling();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('accountNumber')).toBe(
      'POSITIVITY.ERROR.FIELD.ACCOUNT_NUMBER_REQUIRED',
    );
  });

  it('sets both state and errorKey when removing a mapping fails', async () => {
    await setup();
    service.deleteDeliveryAccount.mockReturnValue(throwError(() => httpError(500)));
    component.removeDelivery(springfield);

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('blocks every mutation for a YAML-managed profile', async () => {
    await setup(withGap);
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    component.saveBilling();
    component.saveDelivery();
    component.removeDelivery(springfield);

    expect(service.updateBillingAccount).not.toHaveBeenCalled();
    expect(service.upsertDeliveryAccount).not.toHaveBeenCalled();
    expect(service.deleteDeliveryAccount).not.toHaveBeenCalled();
  });

  it('does not submit an incomplete delivery mapping', async () => {
    await setup(withGap);
    component.startAddDelivery();
    component.saveDelivery();

    expect(service.upsertDeliveryAccount).not.toHaveBeenCalled();
  });

  it('uses canonical billing/delivery vocabulary only — no vendor terms in the rendered UI', async () => {
    await setup(withGap);
    const text = ((fixture.nativeElement as HTMLElement).innerHTML ?? '').toLowerCase();

    expect(text).not.toContain('billto');
    expect(text).not.toContain('shipto');
    expect(text).not.toContain('buyerparty');
    expect(text).not.toContain('consignee');
  });

  it('labels every control (ADR-0029)', async () => {
    await setup(withGap);
    component.startAddDelivery();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    for (const control of Array.from(host.querySelectorAll('input, select'))) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      expect(host.querySelector(`label[for="${id}"]`), `no label for #${id}`).not.toBeNull();
    }
  });
});
