import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { provideCrmCustomerDirectorySource } from './customer-directory-source.provider';
import { CrmService } from './crm.service';
import { CUSTOMER_DIRECTORY_SOURCE } from '../../../shared/customer-directory/customer-directory-source.tokens';
import type { PartyDetail, Relationship } from '../models/crm.models';

describe('provideCrmCustomerDirectorySource', () => {
  const stubCrm = {
    getParty: vi.fn(),
    getContactsWithRoles: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideCrmCustomerDirectorySource(),
        { provide: CrmService, useValue: stubCrm },
      ],
    });
  });

  it('lazily resolves CrmService and maps getParty to a CustomerDirectoryEntry', async () => {
    const party: PartyDetail = {
      partyId: 'party-1',
      legalName: 'Acme Tire Co',
      dba: 'Acme Tire',
      customerNumber: 'CUST-001',
    };
    stubCrm.getParty.mockReturnValue(of(party));
    const source = TestBed.inject(CUSTOMER_DIRECTORY_SOURCE);

    const entry = await firstValueFrom(source.getById('party-1'));

    expect(entry).toEqual({
      partyId: 'party-1',
      legalName: 'Acme Tire Co',
      dba: 'Acme Tire',
      customerNumber: 'CUST-001',
    });
    expect(stubCrm.getParty).toHaveBeenCalledWith('party-1');
  });

  it('maps getContactsWithRoles to CustomerContact[]', async () => {
    const rel: Relationship = {
      relationshipId: 'rel-1',
      personId: 'person-1',
      personName: 'Jane Roe',
      role: 'PRIMARY_CONTACT',
      effectiveFrom: '2024-01-01',
      status: 'ACTIVE',
    };
    stubCrm.getContactsWithRoles.mockReturnValue(of([rel]));
    const source = TestBed.inject(CUSTOMER_DIRECTORY_SOURCE);

    const contacts = await firstValueFrom(source.getContacts('party-1'));

    expect(contacts).toEqual([
      { relationshipId: 'rel-1', personName: 'Jane Roe', role: 'PRIMARY_CONTACT', status: 'ACTIVE' },
    ]);
    expect(stubCrm.getContactsWithRoles).toHaveBeenCalledWith('party-1');
  });

  it('caches the lazily-loaded CrmService across calls', async () => {
    stubCrm.getParty.mockReturnValue(of({ partyId: 'party-1', legalName: 'Acme' }));
    stubCrm.getContactsWithRoles.mockReturnValue(of([]));
    const source = TestBed.inject(CUSTOMER_DIRECTORY_SOURCE);

    await firstValueFrom(source.getById('party-1'));
    await firstValueFrom(source.getContacts('party-1'));

    expect(stubCrm.getParty).toHaveBeenCalledTimes(1);
    expect(stubCrm.getContactsWithRoles).toHaveBeenCalledTimes(1);
  });
});
