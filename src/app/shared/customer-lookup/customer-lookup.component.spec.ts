import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { CustomerLookupComponent } from './customer-lookup.component';
import { CUSTOMER_LOOKUP_SOURCE, CustomerLookupResult } from './customer-lookup.tokens';

const PARTIES: CustomerLookupResult[] = [
  { partyId: 'p1', legalName: 'Acme Tire Co', dba: 'Acme', customerNumber: 'CUST-CP-001' },
  { partyId: 'p2', legalName: 'Blue Ridge Landscaping', customerNumber: 'CUST-CP-004' },
];

describe('CustomerLookupComponent', () => {
  let fixture: ComponentFixture<CustomerLookupComponent>;
  let component: CustomerLookupComponent;
  let search: ReturnType<typeof vi.fn>;
  let getById: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    search = vi.fn().mockReturnValue(of(PARTIES));
    getById = vi.fn().mockReturnValue(of(PARTIES[1]));

    await TestBed.configureTestingModule({
      imports: [CustomerLookupComponent, TranslateModule.forRoot()],
      providers: [{ provide: CUSTOMER_LOOKUP_SOURCE, useValue: { search, getById } }],
    }).compileComponents();

    TestBed.inject(TranslateService).use('en-US');

    fixture = TestBed.createComponent(CustomerLookupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('falls back to its own translated label and re-renders it on a locale switch', () => {
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', { CRM: { CUSTOMER_LOOKUP: { LABEL: 'Customer' } } }, true);
    translate.setTranslation('fr-CA', { CRM: { CUSTOMER_LOOKUP: { LABEL: 'Client' } } }, true);
    const label = () =>
      (fixture.nativeElement as HTMLElement).querySelector('.field-label')?.textContent?.trim();

    translate.use('en-US');
    fixture.detectChanges();
    expect(label()).toBe('Customer');

    // Resolving the default with translate.instant() in a field initializer would
    // leave this stuck on 'Customer'.
    translate.use('fr-CA');
    fixture.detectChanges();
    expect(label()).toBe('Client');
  });

  it('searches server-side (debounced) on input', fakeAsync(() => {
    component.onInput('blue');
    expect(search).not.toHaveBeenCalled(); // debounced
    tick(250);
    expect(search).toHaveBeenCalledWith('blue');
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

  it('writeValue resolves a readable label via getById', () => {
    component.writeValue('p2');
    expect(component.value()).toBe('p2');
    expect(getById).toHaveBeenCalledWith('p2');
    expect(component.query()).toContain('Blue Ridge Landscaping');
  });

  it('writeValue with empty id clears the field and does not fetch', () => {
    component.writeValue('');
    expect(component.value()).toBe('');
    expect(component.query()).toBe('');
    expect(getById).not.toHaveBeenCalled();
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
