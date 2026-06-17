import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocationPickerComponent } from './location-picker.component';
import { LocationService } from '../../services/location.service';

const locations = [
  { id: 'loc-1', name: 'Charlotte Depot', code: 'CLT', mailingAddress: '100 Main St, Charlotte, NC' },
  { id: 'loc-2', name: 'Raleigh Yard', code: 'RAL', addressLine1: '5 Oak Ave', city: 'Raleigh', state: 'NC' },
];

const locationServiceStub = { getAllLocations: vi.fn() };

describe('LocationPickerComponent', () => {
  let fixture: ComponentFixture<LocationPickerComponent>;
  let component: LocationPickerComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.getAllLocations.mockReturnValue(of(locations));

    await TestBed.configureTestingModule({
      imports: [LocationPickerComponent],
      providers: [{ provide: LocationService, useValue: locationServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('filters by name, code, and address', () => {
    component.onInput('raleigh');
    expect(component.suggestions().map(l => l.id)).toEqual(['loc-2']);
    component.onInput('CLT');
    expect(component.suggestions().map(l => l.id)).toEqual(['loc-1']);
    component.onInput('oak');
    expect(component.suggestions().map(l => l.id)).toEqual(['loc-2']);
  });

  it('exposes an address line for a suggestion', () => {
    expect(component.addressOf(locations[0])).toBe('100 Main St, Charlotte, NC');
    expect(component.addressOf(locations[1])).toBe('5 Oak Ave, Raleigh, NC');
  });

  it('emits locationSelected with the id on select', () => {
    const spy = vi.fn();
    component.locationSelected.subscribe(spy);
    component.select(locations[1]);
    expect(spy).toHaveBeenCalledWith('loc-2');
    expect(component.displayValue()).toBe('Raleigh Yard');
  });

  it('preselects a valid selectedId by showing its name', () => {
    fixture.componentRef.setInput('selectedId', 'loc-1');
    fixture.detectChanges();
    expect(component.displayValue()).toBe('Charlotte Depot');
  });

  it('emits invalidSelection when selectedId is unknown after load', () => {
    const spy = vi.fn();
    component.invalidSelection.subscribe(spy);
    fixture.componentRef.setInput('selectedId', 'nope');
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledWith('nope');
    expect(component.displayValue()).toBe('');
  });

  it('clears the selection when the input is emptied after a valid selection', () => {
    const spy = vi.fn();
    component.locationSelected.subscribe(spy);
    component.select(locations[1]);
    expect(component.displayValue()).toBe('Raleigh Yard');
    component.onInput('');
    expect(spy).toHaveBeenLastCalledWith('');
    expect(component.displayValue()).toBe('');
  });

  it('emits invalidSelection exactly once for an unknown id despite other signal changes', () => {
    const spy = vi.fn();
    component.invalidSelection.subscribe(spy);
    fixture.componentRef.setInput('selectedId', 'nope');
    fixture.detectChanges();
    component.onFocus();
    fixture.detectChanges();
    fixture.componentRef.setInput('selectedId', 'nope');
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('selects the first suggestion via ArrowDown then Enter', () => {
    const spy = vi.fn();
    component.locationSelected.subscribe(spy);
    component.onInput('');
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(spy).toHaveBeenCalledWith('loc-1');
  });

  it('shows an error state when locations fail to load', () => {
    locationServiceStub.getAllLocations.mockReturnValue(throwError(() => ({ status: 500 })));
    const fx = TestBed.createComponent(LocationPickerComponent);
    fx.detectChanges();
    expect(fx.componentInstance.loadError()).toBe(true);
  });
});
