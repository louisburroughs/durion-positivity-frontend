import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { CustomerLookupComponent } from './customer-lookup.component';
import { CrmService } from '../../services/crm.service';
import { PartyDetail } from '../../models/crm.models';

const PARTIES: PartyDetail[] = [
  { partyId: 'p1', legalName: 'Acme Tire Co', dba: 'Acme', customerNumber: 'CUST-CP-001' },
  { partyId: 'p2', legalName: 'Blue Ridge Landscaping', customerNumber: 'CUST-CP-004' },
];

describe('CustomerLookupComponent', () => {
  let fixture: ComponentFixture<CustomerLookupComponent>;
  let component: CustomerLookupComponent;
  let searchParties: ReturnType<typeof vi.fn>;
  let getParty: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    searchParties = vi.fn().mockReturnValue(of({ parties: PARTIES }));
    getParty = vi.fn().mockReturnValue(of(PARTIES[1]));

    await TestBed.configureTestingModule({
      imports: [CustomerLookupComponent],
      providers: [{ provide: CrmService, useValue: { searchParties, getParty } }],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerLookupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('searches server-side (debounced) on input', fakeAsync(() => {
    component.onInput('blue');
    expect(searchParties).not.toHaveBeenCalled(); // debounced
    tick(250);
    expect(searchParties).toHaveBeenCalledWith('blue');
    expect(component.suggestions().map(p => p.partyId)).toEqual(['p1', 'p2']);
  }));

  it('emits the selected party id and shows a readable label', () => {
    const seen: string[] = [];
    component.registerOnChange(v => seen.push(v));

    component.select(PARTIES[0]);

    expect(seen).toEqual(['p1']);
    expect(component.value()).toBe('p1');
    expect(component.query()).toContain('Acme Tire Co');
    expect(component.query()).toContain('CUST-CP-001');
  });

  it('clears the value when the user edits the text', fakeAsync(() => {
    component.select(PARTIES[0]);
    const seen: string[] = [];
    component.registerOnChange(v => seen.push(v));

    component.onInput('blu');
    expect(component.value()).toBe('');
    expect(seen).toEqual(['']);
    tick(250);
  }));

  it('writeValue resolves a readable label via getParty', () => {
    component.writeValue('p2');
    expect(component.value()).toBe('p2');
    expect(getParty).toHaveBeenCalledWith('p2');
    expect(component.query()).toContain('Blue Ridge Landscaping');
  });

  it('writeValue with empty id clears the field and does not fetch', () => {
    component.writeValue('');
    expect(component.value()).toBe('');
    expect(component.query()).toBe('');
    expect(getParty).not.toHaveBeenCalled();
  });

  it('Enter selects the active suggestion', fakeAsync(() => {
    component.onInput('cust');
    tick(250);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const expected = component.suggestions()[0].partyId;
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.value()).toBe(expected);
  }));
});
