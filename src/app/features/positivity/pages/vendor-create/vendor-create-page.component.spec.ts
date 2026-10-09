import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Vendor, VendorCreateInput } from '../../models/supplier-vendor.models';
import { VendorAnnouncerService } from '../../services/vendor-announcer.service';
import {
  VENDOR_ID,
  VendorAuthStub,
  VendorServiceMock,
  httpError,
  type,
  vendor,
  vendorPage,
  vendorProviders,
  vendorServiceMock,
} from '../../vendors.spec-helper';
import { VendorCreatePageComponent } from './vendor-create-page.component';

const DRAFT = '/app/accounting/bills/drafts/0192a4c2-0000-7000-8000-000000000abc';

describe('VendorCreatePageComponent (#469 items 3–4)', () => {
  let service: VendorServiceMock;
  let auth: VendorAuthStub;
  let announcer: { announce: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<VendorCreatePageComponent>;
  let router: Router;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(selector: string) => el().querySelector(selector) as T | null;

  async function setup(returnTo: string | null = null): Promise<void> {
    TestBed.configureTestingModule({
      imports: [VendorCreatePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        ...vendorProviders(service, auth),
        { provide: VendorAnnouncerService, useValue: announcer },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(returnTo === null ? {} : { returnTo }) } },
        },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(VendorCreatePageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function fillRequired(): void {
    type(q('[data-testid="vendor-legal-name"]'), 'Acme Tire Ltd');
    type(q('[data-testid="vendor-display-name"]'), 'Acme Tire');
    type(q('[data-testid="vendor-currency"]'), 'usd');
    fixture.detectChanges();
  }

  function submit(): void {
    q<HTMLButtonElement>('[data-testid="vendor-create-submit"]')!.click();
    fixture.detectChanges();
  }

  const sent = (): VendorCreateInput => service.createVendor.mock.calls.at(-1)![0] as VendorCreateInput;

  beforeEach(() => {
    service = vendorServiceMock();
    auth = new VendorAuthStub();
    announcer = { announce: vi.fn() };
  });

  it('AC 3: without a number the request omits it and the server number is announced', async () => {
    await setup();
    fillRequired();
    submit();

    expect(sent()).toEqual({
      vendorNumber: undefined,
      legalName: 'Acme Tire Ltd',
      displayName: 'Acme Tire',
      paymentTerms: 'DUE_ON_RECEIPT',
      currency: 'USD',
      taxRegistrations: [],
      remitTo: undefined,
    });
    expect(announcer.announce).toHaveBeenCalledWith(
      'Vendor V-000123 added. It can take a moment to appear in bills, purchase orders and payments.',
    );
    expect(router.navigate).toHaveBeenCalledWith(['/app', 'positivity', 'vendors', VENDOR_ID]);
  });

  it('AC 3: the consequence naming the first-bill rule precedes Add vendor (P4)', async () => {
    await setup();
    const consequence = q('[data-testid="vendor-create-consequence"]')!;
    const button = q('[data-testid="vendor-create-submit"]')!;

    expect(consequence.textContent?.trim()).toBe(
      "Purchasing, bills and payments will all use this vendor. Whoever adds a vendor can't approve its first bill.",
    );
    expect(consequence.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sends a typed number upper-cased, Net terms, a registration with its number and a remit-to', async () => {
    await setup();
    fillRequired();
    type(q('[data-testid="vendor-number"]'), 'v-acme-1');
    q<HTMLInputElement>('[data-testid="vendor-terms-net"]')!.click();
    fixture.detectChanges();
    type(q('[data-testid="vendor-net-days"]'), '45');
    q<HTMLButtonElement>('[data-testid="vendor-tax-add"]')!.click();
    fixture.detectChanges();
    type(q('[data-testid="vendor-tax-scheme"]'), 'EIN');
    type(q('[data-testid="vendor-tax-number"]'), '12-3456789');
    type(q('[data-testid="remit-payeeName"]'), 'Acme Tire Ltd');
    type(q('[data-testid="remit-countryCode"]'), 'us');
    fixture.detectChanges();
    submit();

    expect(sent()).toMatchObject({
      vendorNumber: 'V-ACME-1',
      paymentTerms: 'NET45',
      taxRegistrations: [{ registrationId: undefined, scheme: 'EIN', region: undefined, number: '12-3456789' }],
      remitTo: { payeeName: 'Acme Tire Ltd', countryCode: 'US' },
    });
  });

  it('refuses to submit while required fields are blank', async () => {
    await setup();
    submit();
    expect(service.createVendor).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Fill this in.');
  });

  it.each([
    ['/app/accounting/bills', '/app/accounting/bills'],
    [DRAFT, DRAFT],
  ])('AC 4: returns to an allowed returnTo %s', async (returnTo, expected) => {
    await setup(returnTo);
    fillRequired();
    submit();
    expect(router.navigateByUrl).toHaveBeenCalledWith(expected);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(announcer.announce).toHaveBeenCalled();
  });

  it.each([['https://evil.example'], ['//evil.example'], ['/app/admin'], [`${DRAFT}?x=1`]])(
    'AC 4: ignores returnTo %s and goes to the vendor detail',
    async returnTo => {
      await setup(returnTo);
      fillRequired();
      submit();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/app', 'positivity', 'vendors', VENDOR_ID]);
    },
  );

  it('Cancel follows the same rule', async () => {
    await setup(DRAFT);
    q<HTMLButtonElement>('[data-testid="vendor-create-cancel"]')!.click();
    expect(router.navigateByUrl).toHaveBeenCalledWith(DRAFT);
  });

  it('Cancel without a valid returnTo goes to the vendor list', async () => {
    await setup('//evil.example');
    q<HTMLButtonElement>('[data-testid="vendor-create-cancel"]')!.click();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/app', 'positivity', 'vendors']);
  });

  it('a taken number marks the number field with the number', async () => {
    service.createVendor.mockReturnValue(throwError(() => httpError(409, 'SUPPLIER_VENDOR_NUMBER_TAKEN')));
    await setup();
    fillRequired();
    type(q('[data-testid="vendor-number"]'), 'V-000123');
    submit();

    expect(q('[data-testid="vendor-number-error"]')?.textContent?.trim()).toBe(
      'V-000123 is already used. Leave it blank to number automatically.',
    );
    expect(q('[data-testid="vendor-number"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.componentInstance.state()).toBe('error');
  });

  it('one submit in flight (§8.2)', async () => {
    const pending = new Subject<Vendor>();
    service.createVendor.mockReturnValue(pending);
    await setup();
    fillRequired();
    submit();
    fixture.componentInstance.submit();

    expect(service.createVendor).toHaveBeenCalledTimes(1);
    expect(q<HTMLButtonElement>('[data-testid="vendor-create-submit"]')!.disabled).toBe(true);
  });

  it('a timeout re-reads matching vendors before Add vendor is offered again', async () => {
    const check = new Subject<ReturnType<typeof vendorPage>>();
    service.createVendor.mockReturnValue(throwError(() => httpError(504)));
    service.listVendors.mockReturnValue(check);
    await setup();
    fillRequired();
    submit();

    expect(service.listVendors).toHaveBeenCalledWith('Acme Tire', undefined, 0, 10);
    expect(q<HTMLButtonElement>('[data-testid="vendor-create-submit"]')!.disabled).toBe(true);

    check.next(vendorPage([vendor()]));
    fixture.detectChanges();
    expect(q('[data-testid="vendor-create-matches"] a')?.getAttribute('href')).toBe(`/app/positivity/vendors/${VENDOR_ID}`);
    expect(q<HTMLButtonElement>('[data-testid="vendor-create-submit"]')!.disabled).toBe(false);
  });

  it('without supplier:vendor:write the form is absent and submit() refuses (ADR-0040 §6a)', async () => {
    auth.grant('supplier:vendor:read');
    await setup();
    expect(q('[data-testid="vendor-create-form"]')).toBeNull();
    fixture.componentInstance.submit();
    expect(service.createVendor).not.toHaveBeenCalled();
  });

  it('has no bank account field (OI-14)', async () => {
    await setup();
    const labels = [...el().querySelectorAll('label, legend')].map(node => node.textContent?.toLowerCase() ?? '');
    expect(labels.length).toBeGreaterThan(10);
    expect(labels.some(label => /bank|iban|routing|account number|swift/.test(label))).toBe(false);
  });
});
