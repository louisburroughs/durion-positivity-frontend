import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import { TaxRegistration } from '../../models/supplier-vendor.models';
import { VENDOR_ID, VendorAuthStub, VendorServiceMock, httpError, type, vendorProviders, vendorServiceMock } from '../../vendors.spec-helper';
import { VendorTaxRegistrationsComponent } from './vendor-tax-registrations.component';

const EIN: TaxRegistration = { registrationId: '0192a4c2-0000-7000-8000-0000000000t1', scheme: 'EIN', region: null, last4: '6789' };
const SHORT: TaxRegistration = { registrationId: '0192a4c2-0000-7000-8000-0000000000t2', scheme: 'GST', region: 'ON', last4: null };

describe('VendorTaxRegistrationsComponent (#2621; ADR-0072 RESTRICTED)', () => {
  let service: VendorServiceMock;
  let fixture: ComponentFixture<VendorTaxRegistrationsComponent>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(selector: string) => el().querySelector(selector) as T | null;
  const all = (selector: string) => [...el().querySelectorAll(selector)];

  function setup(canReveal: boolean, registrations: TaxRegistration[] = [EIN, SHORT]): void {
    TestBed.configureTestingModule({
      imports: [VendorTaxRegistrationsComponent, TranslateModule.forRoot()],
      providers: vendorProviders(service, new VendorAuthStub()),
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    fixture = TestBed.createComponent(VendorTaxRegistrationsComponent);
    fixture.componentRef.setInput('vendorId', VENDOR_ID);
    fixture.componentRef.setInput('registrations', registrations);
    fixture.componentRef.setInput('canReveal', canReveal);
    fixture.detectChanges();
  }

  beforeEach(() => {
    service = vendorServiceMock();
  });

  it('shows registrations masked: last four, or "on file" when there is none', () => {
    setup(false);
    const masked = all('[data-testid="vendor-tax-masked"]').map(node => node.textContent?.replace(/\s+/g, ' ').trim());
    expect(masked).toEqual(['EIN •••• 6789', 'GST (ON) on file']);
  });

  it('hides Reveal without supplier:vendor_tax_id:reveal, and openReveal() refuses', () => {
    setup(false);
    expect(q('[data-testid="vendor-tax-reveal"]')).toBeNull();
    fixture.componentInstance.openReveal(EIN);
    expect(fixture.componentInstance.target()).toBeNull();
  });

  it('reveals after a 10–500 character reason, then drops the number when the dialog closes', () => {
    setup(true);
    (q('[data-testid="vendor-tax-reveal"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q<HTMLDialogElement>('dialog[appModalDialog][data-testid="vendor-tax-dialog"]')!.matches(':modal')).toBe(true);

    type(q('[data-testid="vendor-tax-reveal-reason"]'), 'too short');
    fixture.detectChanges();
    expect(q<HTMLButtonElement>('[data-testid="vendor-tax-reveal-confirm"]')!.disabled).toBe(true);

    type(q('[data-testid="vendor-tax-reveal-reason"]'), 'Checking the W-9 form');
    fixture.detectChanges();
    (q('[data-testid="vendor-tax-reveal-confirm"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.revealTaxRegistration).toHaveBeenCalledWith(VENDOR_ID, EIN.registrationId, 'Checking the W-9 form');
    expect(q('[data-testid="vendor-tax-revealed-number"]')?.textContent?.trim()).toBe('12-3456789');

    (q('[data-testid="vendor-tax-reveal-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.revealed()).toBeNull();
    expect(el().textContent).not.toContain('12-3456789');
  });

  it('a different vendor clears a revealed number', () => {
    setup(true);
    fixture.componentInstance.openReveal(EIN);
    fixture.componentInstance.reason.set('Checking the W-9 form');
    fixture.componentInstance.reveal();
    expect(fixture.componentInstance.revealed()).not.toBeNull();

    fixture.componentRef.setInput('vendorId', 'another');
    fixture.detectChanges();
    expect(fixture.componentInstance.revealed()).toBeNull();
    expect(fixture.componentInstance.target()).toBeNull();
  });

  it('classifies an unreadable number', () => {
    service.revealTaxRegistration.mockReturnValue(throwError(() => httpError(500, 'SUPPLIER_VENDOR_TAX_ID_UNREADABLE')));
    setup(true);
    fixture.componentInstance.openReveal(EIN);
    fixture.componentInstance.reason.set('Checking the W-9 form');
    fixture.componentInstance.reveal();
    fixture.detectChanges();
    expect(q('[data-testid="vendor-tax-reveal-error"]')?.textContent?.trim()).toBe(enUS.POSITIVITY.VENDORS.ERROR.TAX_ID_UNREADABLE);
    expect(fixture.componentInstance.revealed()).toBeNull();
  });
});
