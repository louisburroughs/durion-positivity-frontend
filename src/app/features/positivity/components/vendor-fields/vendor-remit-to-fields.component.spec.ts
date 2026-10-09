import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { remitToGroup } from './vendor-form';
import { VendorRemitToFieldsComponent } from './vendor-remit-to-fields.component';

describe('VendorRemitToFieldsComponent', () => {
  let fixture: ComponentFixture<VendorRemitToFieldsComponent>;

  function setup(fieldErrors: Record<string, string> = {}): HTMLElement {
    TestBed.configureTestingModule({ imports: [VendorRemitToFieldsComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(VendorRemitToFieldsComponent);
    fixture.componentRef.setInput('group', remitToGroup());
    fixture.componentRef.setInput('idPrefix', 'remit');
    fixture.componentRef.setInput('fieldErrors', fieldErrors);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the eight postal fields, each labelled, and no bank field (OI-14)', () => {
    const host = setup();
    const inputs = [...host.querySelectorAll('input')];

    expect(inputs.map(input => input.id)).toEqual([
      'remit-payeeName',
      'remit-addressLine1',
      'remit-addressLine2',
      'remit-city',
      'remit-region',
      'remit-postalCode',
      'remit-countryCode',
      'remit-remittanceEmail',
    ]);
    for (const input of inputs) expect(host.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    expect(host.querySelector('[data-testid*="bank" i], [id*="bank" i], [id*="iban" i]')).toBeNull();
  });

  it('marks a remit-to field the server refused', () => {
    const host = setup({ 'remitTo.remittanceEmail': 'POSITIVITY.VENDORS.ERROR.FIELD.EMAIL' });
    expect(host.querySelector('#remit-remittanceEmail')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#remit-remittanceEmail-error')?.textContent?.trim()).toBe('POSITIVITY.VENDORS.ERROR.FIELD.EMAIL');
  });
});
