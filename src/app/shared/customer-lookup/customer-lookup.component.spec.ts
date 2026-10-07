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

  it('Enter does nothing while the list is closed, leaving the key to the form', fakeAsync(() => {
    component.onInput('cust');
    tick(250);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.showList.set(false); // as the blur timer leaves it: closed, active option kept

    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    component.onKeydown(enter);
    expect(component.value()).toBe('');
    expect(enter.defaultPrevented).toBe(false);
  }));

  it('binds aria-controls only while the listbox is rendered (ADR-0029 §8.9)', fakeAsync(() => {
    const input = fixture.nativeElement.querySelector('input[role="combobox"]') as HTMLInputElement;
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
    expect(input.hasAttribute('aria-controls')).toBe(false);

    component.onInput('cust');
    tick(250);
    fixture.detectChanges();
    const listbox = fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
    expect(listbox).not.toBeNull();
    expect(input.getAttribute('aria-controls')).toBe(listbox.id);

    component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
    expect(input.hasAttribute('aria-controls')).toBe(false);
  }));

  describe('excludeHouseAccounts (CAP:550 S10)', () => {
    const WITH_CASH: CustomerLookupResult[] = [
      ...PARTIES,
      // Keyed on the flag only: this row's name and number look like any other party.
      { partyId: 'p-cash', legalName: 'Counter sales', customerNumber: 'CUST-CP-900', houseAccount: 'CASH_SALE' },
      { partyId: 'p3', legalName: 'Cash & Carry Ltd', customerNumber: 'CASH', houseAccount: null },
    ];

    it('lists a house account by default, so existing consumers are unchanged', fakeAsync(() => {
      search.mockReturnValue(of(WITH_CASH));
      component.onInput('c');
      tick(250);
      expect(component.suggestions().map(p => p.partyId)).toEqual(['p1', 'p2', 'p-cash', 'p3']);
    }));

    it('drops only flagged house accounts when the consumer opts in', fakeAsync(() => {
      search.mockReturnValue(of(WITH_CASH));
      fixture.componentRef.setInput('excludeHouseAccounts', true);
      component.onInput('c');
      tick(250);
      expect(component.suggestions().map(p => p.partyId)).toEqual(['p1', 'p2', 'p3']);
    }));
  });
  it('keeps input focus on a listbox mousedown so the scrollbar stays draggable', fakeAsync(() => {
    component.onInput('cust');
    tick(250);
    fixture.detectChanges();
    const listbox = fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    listbox.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    // An option mousedown must still blur, or a later click cannot reopen the list.
    const optionDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    (listbox.firstElementChild as HTMLElement).dispatchEvent(optionDown);
    expect(optionDown.defaultPrevented).toBe(false);
  }));
});
