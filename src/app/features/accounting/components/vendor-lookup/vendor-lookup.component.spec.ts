import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { VendorLookupComponent } from './vendor-lookup.component';
import { AccountingService } from '../../services/accounting.service';
import { VendorDirectoryEntry } from '../../models/accounting.models';

const VENDORS: VendorDirectoryEntry[] = [
  { vendorId: 'v1', name: 'Acme Auto Parts', vendorNumber: 'V-1042', status: 'ACTIVE' },
  { vendorId: 'v2', name: 'Blue Ridge Supply', status: 'ACTIVE' },
];

describe('VendorLookupComponent', () => {
  let fixture: ComponentFixture<VendorLookupComponent>;
  let component: VendorLookupComponent;
  let searchVendors: ReturnType<typeof vi.fn>;
  let getVendor: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    searchVendors = vi.fn().mockReturnValue(of(VENDORS));
    getVendor = vi.fn().mockReturnValue(of(VENDORS[1]));

    await TestBed.configureTestingModule({
      imports: [VendorLookupComponent, TranslateModule.forRoot()],
      providers: [{ provide: AccountingService, useValue: { searchVendors, getVendor } }],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorLookupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('searches server-side (debounced) on input', fakeAsync(() => {
    component.onInput('blue');
    expect(searchVendors).not.toHaveBeenCalled(); // debounced
    tick(250);
    expect(searchVendors).toHaveBeenCalledWith('blue');
    expect(component.suggestions().map(v => v.vendorId)).toEqual(['v1', 'v2']);
  }));

  it('emits the selected vendor id and shows a readable label', () => {
    const seen: string[] = [];
    component.registerOnChange(v => seen.push(v));

    component.select(VENDORS[0]);

    expect(seen).toEqual(['v1']);
    expect(component.value()).toBe('v1');
    expect(component.query()).toBe('Acme Auto Parts');
  });

  it('clears the value when the user edits the text', fakeAsync(() => {
    component.select(VENDORS[0]);
    const seen: string[] = [];
    component.registerOnChange(v => seen.push(v));

    component.onInput('blu');
    expect(component.value()).toBe('');
    expect(seen).toEqual(['']);
    tick(250);
  }));

  it('writeValue resolves a readable label via getVendor', () => {
    component.writeValue('v2');
    expect(component.value()).toBe('v2');
    expect(getVendor).toHaveBeenCalledWith('v2');
    expect(component.query()).toBe('Blue Ridge Supply');
  });

  it('writeValue with empty id clears the field and does not fetch', () => {
    component.writeValue('');
    expect(component.value()).toBe('');
    expect(component.query()).toBe('');
    expect(getVendor).not.toHaveBeenCalled();
  });

  it('Enter selects the active suggestion', fakeAsync(() => {
    component.onInput('acme');
    tick(250);
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const expected = component.suggestions()[0].vendorId;
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.value()).toBe(expected);
  }));

  it('ignores ArrowUp/ArrowDown when there are no suggestions', () => {
    expect(component.suggestions()).toEqual([]);

    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    component.onKeydown(up);
    expect(component.activeIndex()).toBe(-1);
    expect(up.defaultPrevented).toBe(false); // caret movement left to the input

    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    component.onKeydown(down);
    expect(component.activeIndex()).toBe(-1);
    expect(down.defaultPrevented).toBe(false);
  });
});
