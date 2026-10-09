import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { VendorPage } from '../../models/supplier-vendor.models';
import {
  UUID_TEXT,
  VendorAuthStub,
  VendorServiceMock,
  httpError,
  vendor,
  vendorPage,
  vendorProviders,
  vendorServiceMock,
} from '../../vendors.spec-helper';
import { VendorListPageComponent } from './vendor-list-page.component';

describe('VendorListPageComponent (#469 item 2)', () => {
  let service: VendorServiceMock;
  let auth: VendorAuthStub;
  let fixture: ComponentFixture<VendorListPageComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(selector: string) => el().querySelector<T & Element>(selector) as T | null;

  async function setup(english = false): Promise<void> {
    TestBed.configureTestingModule({
      imports: [VendorListPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), ...vendorProviders(service, auth)],
    });
    if (english) {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS);
      translate.use('en-US');
    }
    fixture = TestBed.createComponent(VendorListPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = vendorServiceMock();
    auth = new VendorAuthStub();
  });

  it('reads ACTIVE vendors first, page 0 at the page size', async () => {
    await setup();
    expect(service.listVendors).toHaveBeenCalledWith(undefined, 'ACTIVE', 0, 50);
    expect(q('[data-testid="vendor-filter-ACTIVE"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-testid="vendor-filter-ALL"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the table with caption, column scopes, mono number, legal name beneath, badge and translated terms', async () => {
    await setup();
    expect(q('table caption')).toBeTruthy();
    expect([...el().querySelectorAll('thead th')].every(th => th.getAttribute('scope') === 'col')).toBe(true);
    expect(q('[data-testid="vendor-row-link"]')?.textContent?.trim()).toBe('V-000123');
    expect(q('[data-testid="vendor-row-link"]')?.getAttribute('href')).toBe(`/app/positivity/vendors/${vendor().vendorId}`);
    expect(q('[data-testid="vendor-row-legal"]')?.textContent?.trim()).toBe('Acme Tire Ltd');
    expect(q('[data-testid="vendor-row-status"]')?.textContent?.trim()).toBe('POSITIVITY.VENDORS.STATUS.ACTIVE');
    expect(q('[data-testid="vendor-row-terms"]')?.textContent?.trim()).toBe('POSITIVITY.VENDORS.TERMS.NET');
  });

  it('never renders a vendor id as text (P8)', async () => {
    await setup();
    expect(el().textContent).not.toMatch(UUID_TEXT);
  });

  it('omits the legal name line when it equals the display name', async () => {
    service.listVendors.mockReturnValue(of(vendorPage([vendor({ legalName: 'Acme Tire' })])));
    await setup();
    expect(q('[data-testid="vendor-row-legal"]')).toBeNull();
  });

  it('searches with q from page 0 and filters by status (All sends no status)', async () => {
    await setup();
    const input = q<HTMLInputElement>('[data-testid="vendor-search"]')!;
    input.value = 'acme';
    input.dispatchEvent(new Event('input'));
    q<HTMLButtonElement>('[data-testid="vendor-search-submit"]')!.click();
    expect(service.listVendors).toHaveBeenLastCalledWith('acme', 'ACTIVE', 0, 50);

    q<HTMLButtonElement>('[data-testid="vendor-filter-ALL"]')!.click();
    expect(service.listVendors).toHaveBeenLastCalledWith('acme', undefined, 0, 50);

    q<HTMLButtonElement>('[data-testid="vendor-filter-INACTIVE"]')!.click();
    expect(service.listVendors).toHaveBeenLastCalledWith('acme', 'INACTIVE', 0, 50);
  });

  it('B9: caption, page label and terms render as full sentences', async () => {
    service.listVendors.mockReturnValue(of(vendorPage([vendor()], { totalPages: 3, totalElements: 120 })));
    await setup(true);
    expect(q('table caption')?.textContent?.trim()).toBe('Vendors (120)');
    expect(q('[data-testid="vendor-page-label"]')?.textContent?.trim()).toBe('Page 1 of 3');
    expect(q('[data-testid="vendor-row-terms"]')?.textContent?.trim()).toBe('Net 30');
  });

  it('A3: a 503 on the list says the vendors could not be loaded', async () => {
    service.listVendors.mockReturnValue(throwError(() => httpError(503)));
    await setup(true);
    expect(q('[data-testid="vendor-list-error"]')?.textContent).toContain('The vendors could not be loaded.');
    expect(q('[data-testid="vendor-list-error"]')?.textContent).not.toContain("couldn't confirm");
  });

  it('pages on the server', async () => {
    service.listVendors.mockReturnValue(of(vendorPage([vendor()], { totalPages: 3, totalElements: 120 })));
    await setup();
    expect(q<HTMLButtonElement>('[data-testid="vendor-page-previous"]')!.disabled).toBe(true);

    q<HTMLButtonElement>('[data-testid="vendor-page-next"]')!.click();
    expect(service.listVendors).toHaveBeenLastCalledWith(undefined, 'ACTIVE', 1, 50);
  });

  it('shows the empty state, with "Add the first one" only for writers', async () => {
    service.listVendors.mockReturnValue(of(vendorPage([])));
    await setup();
    expect(q('[data-testid="vendor-list-empty"]')?.textContent).toContain('POSITIVITY.VENDORS.EMPTY');
    expect(q('[data-testid="vendor-add-first"]')).toBeTruthy();
  });

  it('hides Add vendor without supplier:vendor:write (P5, AC 2)', async () => {
    auth.grant('supplier:vendor:read');
    service.listVendors.mockReturnValue(of(vendorPage([])));
    await setup();
    expect(q('[data-testid="vendor-add"]')).toBeNull();
    expect(q('[data-testid="vendor-add-first"]')).toBeNull();
  });

  it('keeps Add vendor for a token without perm_bits (legacy canAccess fallback)', async () => {
    auth.permissions.set(null);
    await setup();
    expect(q('[data-testid="vendor-add"]')).toBeTruthy();
  });

  it('a failed read sets state before errorKey and offers Retry', async () => {
    service.listVendors.mockReturnValue(throwError(() => httpError(503)));
    await setup();
    expect(fixture.componentInstance.state()).toBe('error');
    expect(q('[data-testid="vendor-list-error"]')?.getAttribute('role')).toBe('alert');
  });

  it('a superseded read never overwrites the newer one (ADR-0063, Subject-driven)', async () => {
    const first = new Subject<VendorPage>();
    const second = new Subject<VendorPage>();
    service.listVendors.mockReturnValueOnce(first).mockReturnValueOnce(second);
    await setup();

    fixture.componentInstance.setStatus('INACTIVE');
    second.next(vendorPage([vendor({ vendorNumber: 'V-000999', status: 'INACTIVE' })]));
    first.next(vendorPage([vendor({ vendorNumber: 'V-000001' })]));
    fixture.detectChanges();

    expect(fixture.componentInstance.rows().map(row => row.vendorNumber)).toEqual(['V-000999']);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('an identity change drops the page and reads again (ADR-0063 §7)', async () => {
    const pending = new Subject<VendorPage>();
    await setup();
    service.listVendors.mockReturnValueOnce(pending).mockReturnValueOnce(of(vendorPage([vendor({ vendorNumber: 'V-000777' })])));

    fixture.componentInstance.load();
    auth.claims.set({ sub: 'someone.else' });
    fixture.detectChanges();
    pending.next(vendorPage([vendor({ vendorNumber: 'V-000555' })]));

    expect(fixture.componentInstance.rows().map(row => row.vendorNumber)).toEqual(['V-000777']);
  });
});
