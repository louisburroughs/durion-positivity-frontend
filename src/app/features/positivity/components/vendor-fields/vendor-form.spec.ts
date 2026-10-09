import { describe, expect, it } from 'vitest';
import { vendor } from '../../vendors.spec-helper';
import { registrationsOf, taxRegistrationGroup, termsOf, vendorFieldsGroup } from './vendor-form';

describe('vendor form model (#2621 tax registrations)', () => {
  it('pre-fills a stored registration without its number and keeps it by id', () => {
    const form = vendorFieldsGroup(vendor());
    const row = form.controls.taxRegistrations.at(0);

    expect(row.controls.number.value).toBe('');
    expect(row.controls.last4.value).toBe('6789');
    expect(row.valid).toBe(true);
    expect(registrationsOf(form)).toEqual([
      { registrationId: '0192a4c2-0000-7000-8000-0000000000t1', scheme: 'EIN', region: undefined, number: undefined },
    ]);
  });

  it('needs the number again when a stored registration changes scheme or region', () => {
    const form = vendorFieldsGroup(vendor());
    const row = form.controls.taxRegistrations.at(0);

    row.controls.region.setValue('ON');
    expect(row.hasError('numberRequired')).toBe(true);

    row.controls.number.setValue('987654321');
    expect(row.valid).toBe(true);
    expect(registrationsOf(form)[0]).toEqual({
      registrationId: '0192a4c2-0000-7000-8000-0000000000t1',
      scheme: 'EIN',
      region: 'ON',
      number: '987654321',
    });
  });

  it('needs a number and a scheme for a new registration', () => {
    const row = taxRegistrationGroup();
    expect(row.hasError('numberRequired')).toBe(true);
    expect(row.controls.scheme.hasError('required')).toBe(true);
  });

  it('sends DUE_ON_RECEIPT or NET<n>, and refuses net days outside 1–120', () => {
    const form = vendorFieldsGroup(vendor({ paymentTerms: 'NET30' }));
    expect(form.controls.termsKind.value).toBe('NET');
    expect(termsOf(form)).toBe('NET30');

    form.controls.netDays.setValue(121);
    expect(form.hasError('netDays')).toBe(true);
    form.controls.netDays.setValue(0);
    expect(form.hasError('netDays')).toBe(true);

    form.controls.termsKind.setValue('DUE_ON_RECEIPT');
    expect(form.hasError('netDays')).toBe(false);
    expect(termsOf(form)).toBe('DUE_ON_RECEIPT');
  });
});
