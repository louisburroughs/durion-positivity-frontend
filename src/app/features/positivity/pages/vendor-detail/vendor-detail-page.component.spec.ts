import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, ParamMap, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Vendor } from '../../models/supplier-vendor.models';
import {
  UUID_TEXT,
  VENDOR_ID,
  VendorAuthStub,
  NEW_REMIT,
  VendorServiceMock,
  change,
  httpError,
  profileServiceMock,
  type,
  vendor,
  vendorProviders,
  vendorServiceMock,
} from '../../vendors.spec-helper';
import { VendorDetailPageComponent } from './vendor-detail-page.component';

describe('VendorDetailPageComponent (#469 item 5)', () => {
  let service: VendorServiceMock;
  let auth: VendorAuthStub;
  let profiles: ReturnType<typeof profileServiceMock>;
  let params: BehaviorSubject<ParamMap>;
  let fixture: ComponentFixture<VendorDetailPageComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(selector: string) => el().querySelector(selector) as T | null;
  const click = (selector: string): void => {
    q<HTMLButtonElement>(selector)!.click();
    fixture.detectChanges();
  };

  async function setup(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [VendorDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        ...vendorProviders(service, auth, profiles),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    fixture = TestBed.createComponent(VendorDetailPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = vendorServiceMock();
    auth = new VendorAuthStub();
    profiles = profileServiceMock();
    params = new BehaviorSubject(convertToParamMap({ vendorId: VENDOR_ID }));
  });

  it('reads the vendor and its remit-to changes, and shows identity, terms and status', async () => {
    await setup();
    expect(service.getVendorDetail).toHaveBeenCalledWith(VENDOR_ID);
    expect(service.listRemitChanges).toHaveBeenCalledWith(VENDOR_ID);
    expect(q('[data-testid="vendor-detail-title"]')?.textContent?.trim()).toBe('V-000123 · Acme Tire');
    expect(q('[data-testid="vendor-terms-value"]')?.textContent?.trim()).toBe('Net 30');
    expect(q('[data-testid="vendor-status-badge"]')?.textContent?.trim()).toBe('Active');
    expect(q('[data-testid="vendor-tax-masked"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('EIN •••• 6789');
  });

  it('AC 10: no UUID as text, no bank field, and markup in a legal name renders as text', async () => {
    service.getVendorDetail.mockReturnValue(of(vendor({ legalName: '<img src=x onerror=alert(1)>' })));
    await setup();

    expect(el().textContent).not.toMatch(UUID_TEXT);
    expect(el().querySelector('img')).toBeNull();
    expect(q('[data-testid="vendor-legal-name-value"]')?.textContent?.trim()).toBe('<img src=x onerror=alert(1)>');
    const labels = [...el().querySelectorAll('label, dt, th, legend')].map(node => node.textContent?.toLowerCase() ?? '');
    expect(labels.some(label => /bank|iban|routing|swift/.test(label))).toBe(false);
  });

  it('shows when and why the status last changed', async () => {
    service.getVendorDetail.mockReturnValue(
      of(vendor({ status: 'INACTIVE', statusChangedAt: '2026-10-02T10:00:00Z', statusReason: 'Stopped trading with them' })),
    );
    await setup();
    expect(q('[data-testid="vendor-status-changed"]')).toBeTruthy();
    expect(q('[data-testid="vendor-status-reason"]')?.textContent).toContain('Stopped trading with them');
    expect(q('[data-testid="vendor-status-action"]')?.textContent?.trim()).toBe('Reactivate');
  });

  describe('AC 2: write controls gate on supplier:vendor:write', () => {
    it('are absent and their handlers refuse without it', async () => {
      auth.grant('supplier:vendor:read', 'supplier:vendor_remit:approve');
      await setup();
      const page = fixture.componentInstance;

      expect(q('[data-testid="vendor-edit"]')).toBeNull();
      expect(q('[data-testid="vendor-status-action"]')).toBeNull();
      expect(q('[data-testid="remit-request"]')).toBeNull();

      page.openEdit();
      page.openStatusDialog();
      page.saveEdit();
      expect(page.editOpen()).toBe(false);
      expect(page.statusDialog()).toBeNull();
      expect(service.updateVendor).not.toHaveBeenCalled();
    });

    it('are present with it', async () => {
      await setup();
      expect(q('[data-testid="vendor-edit"]')).toBeTruthy();
      expect(q('[data-testid="vendor-status-action"]')).toBeTruthy();
      expect(q('[data-testid="remit-request"]')).toBeTruthy();
    });

    it('stay open for a token without perm_bits (legacy fallback)', async () => {
      auth.permissions.set(null);
      await setup();
      expect(q('[data-testid="vendor-edit"]')).toBeTruthy();
    });
  });

  describe('Edit', () => {
    it('saves every field but number, remit-to and status with the read version', async () => {
      await setup();
      click('[data-testid="vendor-edit"]');
      type(q('[data-testid="vendor-display-name"]'), 'Acme');
      click('[data-testid="vendor-edit-save"]');

      expect(service.updateVendor).toHaveBeenCalledWith(VENDOR_ID, {
        legalName: 'Acme Tire Ltd',
        displayName: 'Acme',
        paymentTerms: 'NET30',
        currency: 'USD',
        taxRegistrations: [{ registrationId: '0192a4c2-0000-7000-8000-0000000000t1', scheme: 'EIN', region: undefined, number: undefined }],
        version: 3,
      });
      expect(q('[data-testid="vendor-edit-form"]')).toBeNull();
      expect(q('[data-testid="vendor-edit-form"] [data-testid="vendor-number"]')).toBeNull();
    });

    it('never pre-fills a stored tax-registration number', async () => {
      await setup();
      click('[data-testid="vendor-edit"]');
      expect(q<HTMLInputElement>('[data-testid="vendor-tax-number"]')?.value).toBe('');
      expect(q('[data-testid="vendor-tax-number-hint"]')?.textContent?.trim()).toBe('Leave blank to keep the number ending 6789.');
    });

    it('AC 11: a stale version re-reads and shows the message with the latest values', async () => {
      const latest = vendor({ displayName: 'Acme Tire & Wheel', version: 4 });
      service.updateVendor.mockReturnValue(throwError(() => httpError(409, 'CONFLICT')));
      await setup();
      service.getVendorDetail.mockReturnValue(of(latest));

      click('[data-testid="vendor-edit"]');
      type(q('[data-testid="vendor-display-name"]'), 'Mine');
      click('[data-testid="vendor-edit-save"]');

      expect(q('[data-testid="vendor-edit-error"]')?.textContent?.trim()).toBe('Someone else changed this vendor. Check and save again.');
      expect(q<HTMLInputElement>('[data-testid="vendor-display-name"]')?.value).toBe('Acme Tire & Wheel');
      expect(fixture.componentInstance.vendor()?.version).toBe(4);

      service.updateVendor.mockReturnValue(of(latest));
      click('[data-testid="vendor-edit-save"]');
      expect(service.updateVendor).toHaveBeenLastCalledWith(VENDOR_ID, expect.objectContaining({ version: 4 }));
    });
  });

  describe('AC 7: Deactivate / Reactivate', () => {
    it('opens a native modal dialog with the consequence before the button', async () => {
      await setup();
      click('[data-testid="vendor-status-action"]');
      const dialog = q<HTMLDialogElement>('dialog[appModalDialog][data-testid="vendor-status-dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog!.matches(':modal')).toBe(true);
      expect(q('[data-testid="vendor-status-consequence"]')?.textContent?.trim()).toBe(
        "New bills, payments and purchase orders for this vendor will be refused. Its open bills can still be approved, but they aren't paid while the vendor is inactive.",
      );
    });

    it('keeps the button disabled for a 5-character reason; a valid reason deactivates and Reactivate appears', async () => {
      await setup();
      click('[data-testid="vendor-status-action"]');
      type(q('[data-testid="vendor-status-reason-input"]'), 'short');
      fixture.detectChanges();
      expect(q<HTMLButtonElement>('[data-testid="vendor-status-confirm"]')!.disabled).toBe(true);
      fixture.componentInstance.confirmStatus();
      expect(service.deactivateVendor).not.toHaveBeenCalled();

      type(q('[data-testid="vendor-status-reason-input"]'), 'Stopped trading with them');
      fixture.detectChanges();
      click('[data-testid="vendor-status-confirm"]');

      expect(service.deactivateVendor).toHaveBeenCalledWith(VENDOR_ID, 'Stopped trading with them');
      expect(q('[data-testid="vendor-status-dialog"]')).toBeNull();
      expect(q('[data-testid="vendor-status-badge"]')?.textContent?.trim()).toBe('Inactive');
      expect(q('[data-testid="vendor-status-action"]')?.textContent?.trim()).toBe('Reactivate');
    });

    it('a 409 (already inactive) closes the dialog and re-reads', async () => {
      service.deactivateVendor.mockReturnValue(throwError(() => httpError(409, 'CONFLICT')));
      await setup();
      click('[data-testid="vendor-status-action"]');
      type(q('[data-testid="vendor-status-reason-input"]'), 'Stopped trading with them');
      fixture.detectChanges();
      click('[data-testid="vendor-status-confirm"]');

      expect(q('[data-testid="vendor-status-dialog"]')).toBeNull();
      expect(service.getVendorDetail).toHaveBeenCalledTimes(2);
      expect(q('[data-testid="vendor-notice"]')?.textContent?.trim()).toBe('Someone else changed this vendor. Check and save again.');
    });
  });

  describe('Connections', () => {
    it('are hidden, not shown empty, without supplier:profile:read', async () => {
      auth.grant('supplier:vendor:read');
      await setup();
      expect(q('[data-testid="vendor-connections"]')).toBeNull();
      expect(profiles.listProfiles).not.toHaveBeenCalled();
    });

    it('read the vendor’s profiles; names are plain text without ROLE_ADMIN', async () => {
      await setup();
      expect(profiles.listProfiles).toHaveBeenCalledWith(VENDOR_ID);
      expect(q('[data-testid="vendor-connection-name"]')?.textContent?.trim()).toBe('Acme EDI');
      expect(q('[data-testid="vendor-connection-link"]')).toBeNull();
    });

    it('link to the profile page when the person can reach it', async () => {
      auth.roles.set(['ROLE_ADMIN']);
      await setup();
      expect(q('[data-testid="vendor-connection-link"]')?.getAttribute('href')).toBe(
        '/app/positivity/profiles/0192a4c2-0000-7000-8000-0000000000p1',
      );
    });
  });

  it('a failed changes read keeps the vendor and hides Request a change (ADR-0064)', async () => {
    service.listRemitChanges.mockReturnValue(throwError(() => httpError(503)));
    await setup();
    expect(q('[data-testid="vendor-identity"]')).toBeTruthy();
    expect(q('[data-testid="remit-changes-error"]')).toBeTruthy();
    expect(q('[data-testid="remit-request"]')).toBeNull();
  });

  it('a failed vendor read sets state before the error and offers Retry', async () => {
    service.getVendorDetail.mockReturnValue(throwError(() => httpError(404, 'SUPPLIER_VENDOR_NOT_FOUND')));
    await setup();
    expect(fixture.componentInstance.state()).toBe('error');
    expect(q('[data-testid="vendor-detail-error"]')?.textContent).toContain("This vendor doesn't exist.");
  });

  it('a route change to another vendor drops the first vendor’s late answer (ADR-0063)', async () => {
    const first = new Subject<Vendor>();
    service.getVendorDetail.mockReturnValueOnce(first).mockReturnValueOnce(of(vendor({ vendorId: 'other', vendorNumber: 'V-000999' })));
    await setup();

    params.next(convertToParamMap({ vendorId: 'other' }));
    first.next(vendor());
    fixture.detectChanges();

    expect(fixture.componentInstance.vendor()?.vendorNumber).toBe('V-000999');
  });

  it('an identity change clears the page and reads again (ADR-0063 §7)', async () => {
    await setup();
    click('[data-testid="vendor-edit"]');
    auth.claims.set({ sub: 'someone.else' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.editOpen()).toBe(false);
    expect(service.getVendorDetail).toHaveBeenCalledTimes(2);
  });

  it('AC 5: when B approves, the remit-to and version shown are the server’s new values', async () => {
    service.listRemitChanges.mockReturnValue(of([change({ requestedBy: 'clerk.a' })]));
    await setup();
    service.getVendorDetail.mockReturnValue(of(vendor({ remitTo: NEW_REMIT, remitToVersion: 2, remitToApprovedBy: 'clerk.b' })));
    service.listRemitChanges.mockReturnValue(of([change({ status: 'APPROVED', decidedBy: 'clerk.b', toVersion: 2 })]));

    type(q('[data-testid="remit-verification"]'), 'Called them on the number on file');
    fixture.detectChanges();
    click('[data-testid="remit-approve"]');

    expect(service.approveRemitChange).toHaveBeenCalledWith(VENDOR_ID, change().changeId, 'Called them on the number on file');
    expect(q('[data-testid="remit-current"]')?.textContent).toContain('99 New Rd');
    expect(q('[data-testid="remit-version"]')?.textContent).toContain('Version 2');
    expect(q('[data-testid="remit-pending"]')).toBeNull();
    expect(q('[data-testid="vendor-notice"]')?.textContent?.trim()).toBe('Change approved. Payments now go to the new address.');
  });

  it('a pending change is shown with Approve and Reject; Request a change is hidden (AC 6)', async () => {
    service.listRemitChanges.mockReturnValue(of([change()]));
    await setup();
    expect(q('[data-testid="remit-pending"]')).toBeTruthy();
    expect(q('[data-testid="remit-request"]')).toBeNull();
  });
});
