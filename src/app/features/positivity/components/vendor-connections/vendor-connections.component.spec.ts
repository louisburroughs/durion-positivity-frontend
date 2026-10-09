import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import {
  VENDOR_ID,
  VendorAuthStub,
  httpError,
  profileServiceMock,
  profileSummary,
  vendorProviders,
  vendorServiceMock,
} from '../../vendors.spec-helper';
import { VendorConnectionsComponent } from './vendor-connections.component';

describe('VendorConnectionsComponent (#469 item 5)', () => {
  let auth: VendorAuthStub;
  let profiles: ReturnType<typeof profileServiceMock>;
  let fixture: ComponentFixture<VendorConnectionsComponent>;

  const q = (selector: string) => (fixture.nativeElement as HTMLElement).querySelector(selector);

  function setup(): void {
    TestBed.configureTestingModule({
      imports: [VendorConnectionsComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), ...vendorProviders(vendorServiceMock(), auth, profiles)],
    });
    fixture = TestBed.createComponent(VendorConnectionsComponent);
    fixture.componentRef.setInput('vendorId', VENDOR_ID);
    fixture.detectChanges();
  }

  beforeEach(() => {
    auth = new VendorAuthStub();
    profiles = profileServiceMock();
  });

  it('reads the vendor’s profiles by vendorId', () => {
    setup();
    expect(profiles.listProfiles).toHaveBeenCalledWith(VENDOR_ID);
    expect(q('[data-testid="vendor-connection"]')?.textContent).toContain('Acme EDI');
  });

  it('links a profile only when both gates of its route pass (ROLE_ADMIN and supplier:profile:read)', () => {
    auth.roles.set(['ROLE_ADMIN']);
    auth.grant('supplier:vendor:read');
    setup();
    expect(q('[data-testid="vendor-connection-link"]')).toBeNull();
    expect(q('[data-testid="vendor-connection-name"]')?.textContent?.trim()).toBe('Acme EDI');
  });

  it('links a profile for an admin holding supplier:profile:read', () => {
    auth.roles.set(['ROLE_ADMIN']);
    setup();
    expect(q('[data-testid="vendor-connection-link"]')?.getAttribute('href')).toBe(
      `/app/positivity/profiles/${profileSummary().vendorProfileId}`,
    );
  });

  it('says so when the vendor has no connections', () => {
    profiles.listProfiles.mockReturnValue(of([]));
    setup();
    expect(q('[data-testid="vendor-connections-empty"]')).toBeTruthy();
  });

  it('a failed read offers Retry instead of an empty list (ADR-0064)', () => {
    profiles.listProfiles.mockReturnValue(throwError(() => httpError(503)));
    setup();
    expect(q('[data-testid="vendor-connections-error"]')?.getAttribute('role')).toBe('alert');
    expect(q('[data-testid="vendor-connections-empty"]')).toBeNull();
  });

  it('a different vendor’s late answer is dropped (ADR-0063)', () => {
    const first = new Subject<VendorProfileSummary[]>();
    profiles.listProfiles.mockReturnValueOnce(first).mockReturnValueOnce(of([profileSummary({ displayName: 'Second' })]));
    setup();
    fixture.componentRef.setInput('vendorId', 'another');
    fixture.detectChanges();
    first.next([profileSummary({ displayName: 'First' })]);
    fixture.detectChanges();

    expect(fixture.componentInstance.profiles().map(profile => profile.displayName)).toEqual(['Second']);
  });
});
