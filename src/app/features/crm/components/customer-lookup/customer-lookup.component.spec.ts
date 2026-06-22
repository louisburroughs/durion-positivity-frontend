import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { CustomerLookupComponent } from './customer-lookup.component';
import { CrmService } from '../../services/crm.service';
import { PartyDetail } from '../../models/crm.models';

const PARTIES: PartyDetail[] = [
  { partyId: 'p1', legalName: 'Acme Tire Co', dba: 'Acme', customerNumber: 'CUST-CP-001' },
  { partyId: 'p2', legalName: 'Blue Ridge Landscaping', customerNumber: 'CUST-CP-004' },
  { partyId: 'p3', legalName: 'Angela Freeman', customerNumber: 'CUST-PP-004' },
];

describe('CustomerLookupComponent', () => {
  let fixture: ComponentFixture<CustomerLookupComponent>;
  let component: CustomerLookupComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerLookupComponent],
      providers: [
        { provide: CrmService, useValue: { browseParties: () => of({ parties: PARTIES }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerLookupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit → load parties
  });

  it('loads the party directory on init', () => {
    expect(component.allCustomers().length).toBe(3);
  });

  it('filters suggestions by legal name, DBA, and customer number', () => {
    component.onInput('acme');
    expect(component.suggestions().map(p => p.partyId)).toEqual(['p1']);

    component.onInput('CUST-CP-004');
    expect(component.suggestions().map(p => p.partyId)).toEqual(['p2']);
  });

  it('emits the selected party id and shows a readable label', () => {
    const seen: string[] = [];
    component.registerOnChange(v => seen.push(v));

    component.select(PARTIES[0]);

    expect(seen).toEqual(['p1']);
    expect(component.value()).toBe('p1');
    expect(component.query()).toContain('Acme Tire Co');
    expect(component.query()).toContain('CUST-CP-001');
  });

  it('clears the value when the user edits the text', () => {
    component.select(PARTIES[0]);
    const seen: string[] = [];
    component.registerOnChange(v => seen.push(v));

    component.onInput('blu');

    expect(component.value()).toBe('');
    expect(seen).toEqual(['']);
  });

  it('writeValue resolves the display label for a known id', () => {
    component.writeValue('p3');
    expect(component.value()).toBe('p3');
    expect(component.query()).toContain('Angela Freeman');
  });

  it('Enter selects the active suggestion', () => {
    component.onInput('cust');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const expected = component.suggestions()[0].partyId;
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.value()).toBe(expected);
  });
});
