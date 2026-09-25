import { customerDirectoryLabel, vehicleLabel } from './customer-directory-source.tokens';

describe('customerDirectoryLabel', () => {
  it('prefers legal name, appending dba and customer number when present', () => {
    expect(customerDirectoryLabel({ partyId: 'p1', legalName: 'Acme Tire Co' })).toBe('Acme Tire Co');
    expect(customerDirectoryLabel({ partyId: 'p1', legalName: 'Acme Tire Co', dba: 'Acme' })).toBe(
      'Acme Tire Co (Acme)',
    );
    expect(
      customerDirectoryLabel({ partyId: 'p1', legalName: 'Acme Tire Co', customerNumber: 'CUST-1' }),
    ).toBe('Acme Tire Co · CUST-1');
    expect(
      customerDirectoryLabel({
        partyId: 'p1',
        legalName: 'Acme Tire Co',
        dba: 'Acme',
        customerNumber: 'CUST-1',
      }),
    ).toBe('Acme Tire Co (Acme) · CUST-1');
  });
});

describe('vehicleLabel', () => {
  it('joins year, make and model, appending the VIN', () => {
    expect(vehicleLabel({ year: 2020, make: 'Ford', model: 'F-150', vin: '1FTEST' })).toBe(
      '2020 Ford F-150 — 1FTEST',
    );
  });

  it('skips absent parts without leaving double spaces', () => {
    expect(vehicleLabel({ make: 'Ford', vin: '1FTEST' })).toBe('Ford — 1FTEST');
  });

  it('prefers the structured year/make/model + VIN over the description when a VIN is present', () => {
    expect(vehicleLabel({ year: 2020, make: 'Ford', vin: '1FTEST', description: 'A truck' })).toBe(
      '2020 Ford — 1FTEST',
    );
  });

  it('falls back to the unstructured description when nothing is structured', () => {
    expect(vehicleLabel({ description: 'A truck' })).toBe('A truck');
  });

  it('returns empty string when nothing is known', () => {
    expect(vehicleLabel({})).toBe('');
  });
});
