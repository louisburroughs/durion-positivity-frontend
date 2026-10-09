import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { vendor } from '../../vendors.spec-helper';
import { VendorFieldsComponent } from './vendor-fields.component';
import { VendorFieldsGroup, vendorFieldsGroup } from './vendor-form';

describe('VendorFieldsComponent', () => {
  let fixture: ComponentFixture<VendorFieldsComponent>;
  let group: VendorFieldsGroup;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends Element = HTMLElement>(selector: string) => el().querySelector(selector) as T | null;

  function setup(form: VendorFieldsGroup, fieldErrors: Record<string, string> = {}, submitted = false): void {
    group = form;
    TestBed.configureTestingModule({ imports: [VendorFieldsComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(VendorFieldsComponent);
    fixture.componentRef.setInput('group', form);
    fixture.componentRef.setInput('idPrefix', 'test');
    fixture.componentRef.setInput('fieldErrors', fieldErrors);
    fixture.componentRef.setInput('submitted', submitted);
    fixture.detectChanges();
  }

  it('labels every text control', () => {
    setup(vendorFieldsGroup(vendor()));
    for (const input of el().querySelectorAll('input:not([type="radio"])')) {
      expect(q(`label[for="${input.id}"]`), input.id).not.toBeNull();
    }
  });

  it('shows client hints once a submit was attempted', () => {
    setup(vendorFieldsGroup(), {}, true);
    expect(q('#test-legal-name')?.getAttribute('aria-invalid')).toBe('true');
    expect(q('#test-legal-name-error')?.textContent?.trim()).toBe('POSITIVITY.VENDORS.FORM.REQUIRED');
  });

  it('adds and removes tax registrations; a new one asks for its number', () => {
    setup(vendorFieldsGroup());
    q<HTMLButtonElement>('[data-testid="vendor-tax-add"]')!.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('[data-testid="vendor-tax-row"]')).toHaveLength(1);
    expect(q('[data-testid="vendor-tax-number-hint"]')?.textContent?.trim()).toBe('POSITIVITY.VENDORS.TAX.NUMBER_NEW_HINT');

    q<HTMLButtonElement>('[data-testid="vendor-tax-remove"]')!.click();
    fixture.detectChanges();
    expect(group.controls.taxRegistrations.length).toBe(0);
  });

  it('asks for the number again when a stored registration’s region changes', () => {
    setup(vendorFieldsGroup(vendor()));
    expect(q('[data-testid="vendor-tax-number-hint"]')?.textContent?.trim()).toBe('POSITIVITY.VENDORS.TAX.NUMBER_KEEP_HINT');
    group.controls.taxRegistrations.at(0).controls.region.setValue('ON');
    fixture.detectChanges();
    expect(q('[data-testid="vendor-tax-number-hint"]')?.textContent?.trim()).toBe('POSITIVITY.VENDORS.TAX.NUMBER_RETYPE_HINT');
  });

  it('shows Net days only for Net terms', () => {
    setup(vendorFieldsGroup(vendor({ paymentTerms: 'DUE_ON_RECEIPT' })));
    expect(q('[data-testid="vendor-net-days"]')).toBeNull();
    group.controls.termsKind.setValue('NET');
    fixture.detectChanges();
    expect(q('[data-testid="vendor-net-days"]')).not.toBeNull();
  });

  it('marks fields the server refused, including a tax-registration path', () => {
    setup(vendorFieldsGroup(vendor()), {
      defaultCurrency: 'POSITIVITY.VENDORS.ERROR.FIELD.CURRENCY',
      'taxRegistrations[0].number': 'POSITIVITY.VENDORS.ERROR.FIELD.TAX_NUMBER',
    });
    expect(q('#test-currency')?.getAttribute('aria-invalid')).toBe('true');
    expect(q('#test-currency-error')?.textContent?.trim()).toBe('POSITIVITY.VENDORS.ERROR.FIELD.CURRENCY');
    expect(q('#test-tax-number-0')?.getAttribute('aria-invalid')).toBe('true');
  });
});
