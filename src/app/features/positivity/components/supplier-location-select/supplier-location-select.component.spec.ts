/**
 * Delivery-location picker (issue #190).
 *
 * ADR-0031: the error test asserts both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierLocationSelectComponent } from './supplier-location-select.component';
import { SupplierDeliveryLocationService } from '../../services/supplier-delivery-location.service';
import { SupplierDeliveryLocation } from '../../models/supplier-availability.models';

const LOCATION_A = 'ffc9a4c2-0000-7000-8000-0000000000aa';
const LOCATION_B = 'ffc9a4c2-0000-7000-8000-0000000000bb';

const roster: SupplierDeliveryLocation[] = [
  { locationId: LOCATION_A, name: 'Downtown Service Center' },
  { locationId: LOCATION_B, name: 'North Depot' },
];

describe('SupplierLocationSelectComponent', () => {
  let fixture: ComponentFixture<SupplierLocationSelectComponent>;
  let selected: string | null;

  const locationService = {
    listActiveLocations: vi.fn(),
    select: vi.fn((id: string | null) => {
      selected = id;
    }),
    /** Stands in for the service's `WritableSignal` read. */
    selectedLocationId: (): string | null => selected,
  };

  beforeEach(async () => {
    selected = null;
    locationService.listActiveLocations.mockReturnValue(of(roster));

    await TestBed.configureTestingModule({
      imports: [SupplierLocationSelectComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierDeliveryLocationService, useValue: locationService }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierLocationSelectComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders one option per active location behind an explicit "choose" placeholder', () => {
    const el = render();
    const options = Array.from(el.querySelectorAll('option'));

    expect(options).toHaveLength(3);
    expect(options[0].value).toBe('');
    expect(options.map(option => option.value)).toEqual(['', LOCATION_A, LOCATION_B]);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('does not preselect a location — nothing is chosen until the user chooses', () => {
    render();

    expect(fixture.componentInstance.hasSelection()).toBe(false);
    expect(locationService.select).not.toHaveBeenCalled();
  });

  it('associates a visible label with the select control (ADR-0029)', () => {
    const el = render();
    const label = el.querySelector('label');
    const select = el.querySelector('select');

    expect(label?.getAttribute('for')).toBe(select?.id);
    expect(select?.id).toBeTruthy();
    expect(label?.textContent?.trim()).toBe('POSITIVITY.AVAILABILITY.LOCATION.LABEL');
  });

  it('gives each instance a distinct control id so several can share a page', () => {
    const other = TestBed.createComponent(SupplierLocationSelectComponent);

    expect(other.componentInstance.controlId).not.toBe(fixture.componentInstance.controlId);
  });

  it('records the user choice on the shared session context', () => {
    render();
    fixture.componentInstance.onSelect(LOCATION_B);

    expect(locationService.select).toHaveBeenCalledWith(LOCATION_B);
  });

  it('clears the choice when the placeholder is reselected', () => {
    render();
    fixture.componentInstance.onSelect('');

    expect(locationService.select).toHaveBeenCalledWith(null);
  });

  it('forgets a remembered location that is no longer active', () => {
    selected = 'ffc9a4c2-0000-7000-8000-0000000000cc';
    render();

    expect(locationService.select).toHaveBeenCalledWith(null);
  });

  it('keeps a remembered location that is still active', () => {
    selected = LOCATION_A;
    render();

    expect(locationService.select).not.toHaveBeenCalled();
    expect(fixture.componentInstance.hasSelection()).toBe(true);
  });

  it('reports an empty roster in place rather than pretending the picker works', () => {
    locationService.listActiveLocations.mockReturnValue(of([]));
    const el = render();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(el.querySelector('select')?.disabled).toBe(true);
  });

  it('sets state then errorKey when the roster read fails (ADR-0031)', () => {
    locationService.listActiveLocations.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Service Unavailable' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('offers a retry that re-reads the roster', () => {
    locationService.listActiveLocations.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );
    render();
    expect(fixture.componentInstance.state()).toBe('error');

    locationService.listActiveLocations.mockReturnValue(of(roster));
    fixture.componentInstance.reload();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.errorKey()).toBeNull();
  });

  it('cancels an in-flight roster read when the retry supersedes it (ADR-0033)', () => {
    const pending = new Subject<SupplierDeliveryLocation[]>();
    locationService.listActiveLocations.mockReturnValueOnce(pending.asObservable());
    render();
    expect(pending.observed).toBe(true);

    locationService.listActiveLocations.mockReturnValue(of(roster));
    fixture.componentInstance.reload();
    fixture.detectChanges();

    expect(pending.observed).toBe(false);
  });
});
