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
  SupplierBillingAccount,
  SupplierDeliveryAccount,
} from '../../models/supplier-profile.models';

const PROFILE_ID = 'profile-1';

const springfield: SupplierDeliveryAccount = {
  accountId: 'acct-delivery-1',
  locationId: 'loc-1',
  locationName: 'Springfield Main',
  accountNumber: '4711-01',
  agencyCode: 'A1',
};

const billing: SupplierBillingAccount = {
  accountId: 'acct-billing',
  accountNumber: '4711',
  agencyCode: 'A1',
};

const fullyMapped: SupplierAccounts = {
  billing,
  delivery: [springfield],
  activeLocations: [{ locationId: 'loc-1', name: 'Springfield Main' }],
  locationsAvailable: true,
};

const withGap: SupplierAccounts = {
  billing,
  delivery: [springfield],
  activeLocations: [
    { locationId: 'loc-1', name: 'Springfield Main' },
    { locationId: 'loc-2', name: 'Shelbyville Depot' },
    { locationId: 'loc-3', name: 'Ogdenville Yard' },
  ],
  locationsAvailable: true,
};

/** The pos-location roster was unreachable: the gap check cannot be run. */
const locationsUnavailable: SupplierAccounts = {
  billing,
  delivery: [springfield],
  activeLocations: [],
  locationsAvailable: false,
};

function httpError(status: number, body?: SupplierApiErrorBody): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'x', error: body ?? null });
}

describe('SupplierAccountsPanelComponent', () => {
  let fixture: ComponentFixture<SupplierAccountsPanelComponent>;
  let component: SupplierAccountsPanelComponent;
  let service: {
    getAccounts: ReturnType<typeof vi.fn>;
    saveBillingAccount: ReturnType<typeof vi.fn>;
    saveDeliveryAccount: ReturnType<typeof vi.fn>;
    deleteAccount: ReturnType<typeof vi.fn>;
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
      saveBillingAccount: vi.fn().mockReturnValue(of(billing)),
      saveDeliveryAccount: vi.fn().mockReturnValue(of(springfield)),
      deleteAccount: vi.fn().mockReturnValue(of(undefined)),
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

  // ── Degradation when the location roster is unreachable ───────────────────

  it('still renders the delivery mappings when the location roster is unavailable', async () => {
    await setup(locationsUnavailable);

    // A pos-location outage must not error the whole accounts tab.
    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
    expect(component.deliveryAccounts()).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).not.toBeNull();
  });

  it('says the gap check could not be run rather than claiming there are no gaps', async () => {
    await setup(locationsUnavailable);
    const host = fixture.nativeElement as HTMLElement;

    expect(component.locationsAvailable()).toBe(false);
    expect(component.hasMappingGap()).toBe(false);
    expect(host.textContent).toContain('POSITIVITY.ACCOUNTS.DELIVERY.GAP_UNVERIFIED');
    expect(host.querySelector('.pos-banner--warning')).toBeNull();
  });

  it('shows no unverified note when the roster loaded normally', async () => {
    await setup(fullyMapped);

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'POSITIVITY.ACCOUNTS.DELIVERY.GAP_UNVERIFIED',
    );
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

    expect(service.saveBillingAccount).toHaveBeenCalledWith(PROFILE_ID, {
      accountId: 'acct-billing',
      accountNumber: '9000',
      agencyCode: 'B2',
    });
  });

  it('omits a blank agency code rather than sending an empty string', async () => {
    await setup();
    component.billingForm.patchValue({ accountNumber: '9000', agencyCode: '  ' });
    component.saveBilling();

    expect(service.saveBillingAccount).toHaveBeenCalledWith(PROFILE_ID, {
      accountId: 'acct-billing',
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

    expect(service.saveDeliveryAccount).toHaveBeenCalledWith(PROFILE_ID, {
      accountId: undefined,
      locationId: 'loc-2',
      accountNumber: '4711-02',
      agencyCode: 'A1',
    });
  });

  it('maps a malformed location UUID 400 to the locationId field with state and errorKey set', async () => {
    await setup(withGap);
    service.saveDeliveryAccount.mockReturnValue(
      throwError(() =>
        httpError(400, {
          fieldErrors: [{ field: 'deliveryLocationId', message: 'must be a UUID' }],
        }),
      ),
    );
    component.startAddDelivery();
    component.deliveryForm.patchValue({ locationId: 'not-a-uuid', accountNumber: '1' });
    component.saveDelivery();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('deliveryLocationId')).toBe(
      'POSITIVITY.ERROR.FIELD.LOCATION_UUID_MALFORMED',
    );
    expect(component.fieldDetail('deliveryLocationId')).toBe('must be a UUID');
  });

  it('maps a billing 400 to the account number field with state and errorKey set', async () => {
    await setup();
    service.saveBillingAccount.mockReturnValue(
      throwError(() =>
        httpError(400, {
          fieldErrors: [{ field: 'accountNumber', message: 'must not be blank' }],
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
    service.deleteAccount.mockReturnValue(throwError(() => httpError(500)));
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

    expect(service.saveBillingAccount).not.toHaveBeenCalled();
    expect(service.saveDeliveryAccount).not.toHaveBeenCalled();
    expect(service.deleteAccount).not.toHaveBeenCalled();
  });

  it('shows the write controls disabled, with the reason, on a YAML-managed profile', async () => {
    await setup(withGap);
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const reason = host.querySelector('#accounts-readonly-reason');
    expect(reason?.textContent).toContain('POSITIVITY.COMMON.YAML_MANAGED_READONLY');

    // Visible but inert — a hidden control would teach the operator nothing.
    const saveBilling = host.querySelector<HTMLButtonElement>('.accounts-form button[type="submit"]');
    expect(saveBilling).not.toBeNull();
    expect(saveBilling!.disabled).toBe(true);
    expect(saveBilling!.getAttribute('aria-describedby')).toBe('accounts-readonly-reason');
  });

  it('keeps the mapping controls visible and disabled rather than removing them', async () => {
    await setup(withGap);
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();

    const rowButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'tbody button, .accounts-panel__gap-list button',
      ),
    );

    expect(rowButtons.length).toBeGreaterThan(0);
    expect(rowButtons.every(b => b.disabled)).toBe(true);
  });

  it('reports a 409 on a YAML profile as the source-of-truth lock, not a generic failure', async () => {
    await setup();
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    // Bypass the client-side guard to prove the server rejection is handled too.
    service.saveBillingAccount.mockReturnValue(throwError(() => httpError(409)));
    component.billingForm.patchValue({ accountNumber: '9000' });
    component['handleMutationError'](httpError(409), 'POSITIVITY.ACCOUNTS.ERROR.SAVE_BILLING');
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.CONFLICT_YAML');
    expect(component.conflict()).toBe(true);
  });

  it('offers no retry button for a conflict — retrying would fail identically', async () => {
    await setup();
    component['handleMutationError'](httpError(409), 'POSITIVITY.ACCOUNTS.ERROR.SAVE_BILLING');
    fixture.detectChanges();

    const banner = (fixture.nativeElement as HTMLElement).querySelector('.pos-banner--error');
    expect(banner?.textContent).not.toContain('POSITIVITY.COMMON.RETRY');
  });

  it('reports a 409 on an admin-managed profile as an ordinary conflict', async () => {
    await setup();
    component['handleMutationError'](httpError(409), 'POSITIVITY.ACCOUNTS.ERROR.SAVE_BILLING');

    expect(component.errorKey()).toBe('POSITIVITY.ERROR.CONFLICT');
    expect(component.conflict()).toBe(true);
  });

  it('does not submit an incomplete delivery mapping', async () => {
    await setup(withGap);
    component.startAddDelivery();
    component.saveDelivery();

    expect(service.saveDeliveryAccount).not.toHaveBeenCalled();
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
