import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { CUSTOMER_LOOKUP_SOURCE, CustomerLookupResult } from '../../../shared/customer-lookup/customer-lookup.tokens';
import type { PartyDetail } from '../models/crm.models';
import { CrmService } from './crm.service';
import { provideCrmCustomerLookupSource } from './customer-lookup-source.provider';

const ORDINARY: PartyDetail = {
  partyId: 'p1',
  legalName: 'Acme Tire Co',
  dba: 'Acme',
  customerNumber: 'CUST-CP-001',
  status: 'ACTIVE',
};
const CASH: PartyDetail = {
  partyId: 'p-cash',
  legalName: 'Walk-in customer',
  customerNumber: 'CASH',
  houseAccount: 'CASH_SALE',
};

describe('provideCrmCustomerLookupSource (houseAccount mapping, CAP:550 S10)', () => {
  const crm = {
    searchParties: vi.fn().mockReturnValue(of({ parties: [ORDINARY, CASH] })),
    getParty: vi.fn().mockReturnValue(of(CASH)),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideCrmCustomerLookupSource(), { provide: CrmService, useValue: crm }],
    });
  });

  it('carries the houseAccount flag from search rows, null for an ordinary party', async () => {
    const rows = await firstValueFrom(TestBed.inject(CUSTOMER_LOOKUP_SOURCE).search('a'));
    const expected: CustomerLookupResult[] = [
      { partyId: 'p1', legalName: 'Acme Tire Co', dba: 'Acme', customerNumber: 'CUST-CP-001', houseAccount: null },
      { partyId: 'p-cash', legalName: 'Walk-in customer', dba: undefined, customerNumber: 'CASH', houseAccount: 'CASH_SALE' },
    ];
    expect(rows).toEqual(expected);
    expect(crm.searchParties).toHaveBeenCalledWith('a');
  });

  it('carries the houseAccount flag from a single-party read', async () => {
    const row = await firstValueFrom(TestBed.inject(CUSTOMER_LOOKUP_SOURCE).getById('p-cash'));
    expect(row?.houseAccount).toBe('CASH_SALE');
    expect(crm.getParty).toHaveBeenCalledWith('p-cash');
  });
});
