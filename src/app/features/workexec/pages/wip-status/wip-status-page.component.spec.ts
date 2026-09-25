import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { LOCATION_LOOKUP_SOURCE } from '../../../../shared/location-picker/location-lookup-source.tokens';
import { Subject, of, throwError } from 'rxjs';
import { WorkorderWipView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { WipStatusPageComponent } from './wip-status-page.component';

describe('WipStatusPageComponent', () => {
  let fixture: ComponentFixture<WipStatusPageComponent>;
  let component: WipStatusPageComponent;

  const serviceMock = {
    listActiveWorkorders: vi.fn(),
  };
  const locations = [
    { id: 'loc-1', name: 'Charlotte Main', city: 'Charlotte', state: 'NC' },
    { id: 'loc-2', name: 'Raleigh North', city: 'Raleigh', state: 'NC' },
  ];
  const locationServiceStub = {
    getAll: vi.fn(),
    getById: vi.fn(),
  };

  beforeEach(async () => {
    serviceMock.listActiveWorkorders.mockReset();
    locationServiceStub.getAll.mockReset().mockReturnValue(of(locations));
    locationServiceStub.getById.mockReset().mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [WipStatusPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: serviceMock },
        { provide: LOCATION_LOOKUP_SOURCE, useValue: locationServiceStub },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    // ADR-0035 §8: copy asserted against the shipped bundle.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(WipStatusPageComponent);
    component = fixture.componentInstance;
  });

  it('starts idle without a selected location', () => {
    fixture.detectChanges();

    expect(component.state()).toBe('idle');
    expect(serviceMock.listActiveWorkorders).not.toHaveBeenCalled();
  });

  it('offers locations from a picker, not a free-text id box', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const picker = el.querySelector<HTMLInputElement>('[data-testid="wip-location-picker"] input[role="combobox"]');

    expect(locationServiceStub.getAll).toHaveBeenCalled();
    expect(picker).not.toBeNull();
    expect(picker?.placeholder).toBe(enUS.WORKEXEC.WIP.LOCATION.PLACEHOLDER);
    expect(el.querySelector('[data-testid="wip-location-input"]')).toBeNull();
    expect(el.querySelector('[data-testid="wip-location-load"]')).toBeNull();
    expect(el.querySelector('.wip__hint')?.textContent?.trim()).toBe(enUS.WORKEXEC.WIP.LOCATION.HINT);
  });

  it('loads the board as soon as a location is picked', () => {
    serviceMock.listActiveWorkorders.mockReturnValue(of([]));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('[data-testid="wip-location-picker"] input[role="combobox"]')!;

    input.value = 'Ral';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const option = Array.from(el.querySelectorAll<HTMLLIElement>('[role="option"]')).find(o => o.textContent?.includes('Raleigh North'))!;
    option.dispatchEvent(new MouseEvent('mousedown'));
    fixture.detectChanges();

    expect(serviceMock.listActiveWorkorders).toHaveBeenCalledWith('loc-2');
    expect(component.locationId()).toBe('loc-2');
    expect(component.state()).toBe('empty');
  });

  it('returns to idle when the picker is cleared', () => {
    serviceMock.listActiveWorkorders.mockReturnValue(of([]));
    component.loadLocation('loc-1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('[data-testid="wip-location-picker"] input[role="combobox"]')!;

    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.locationId()).toBe('');
    expect(component.state()).toBe('idle');
  });

  it('renders ready state with WIP items after a location is loaded', () => {
    const fixtureItems: WorkorderWipView[] = [
      {
        workorderId: 'wo-1',
        status: 'WORK_IN_PROGRESS',
        locationId: 'loc-1',
        assignedTechnicianId: 'tech-1',
      },
    ];
    serviceMock.listActiveWorkorders.mockReturnValue(of(fixtureItems));

    component.loadLocation('loc-1');
    fixture.detectChanges();

    expect(serviceMock.listActiveWorkorders).toHaveBeenCalledWith('loc-1');
    expect(component.state()).toBe('ready');
    expect(component.wipItems()).toEqual(fixtureItems);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="wip-row"]').length).toBe(1);
  });

  it('sets error state before errorKey when load fails', () => {
    serviceMock.listActiveWorkorders.mockReturnValue(throwError(() => new Error('boom')));
    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    component.loadLocation('loc-1');

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('WORKEXEC.WIP.ERROR.LOAD');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });

  describe('superseded reads (ADR-0063)', () => {
    const rowFor = (locationId: string): WorkorderWipView => ({
      workorderId: `wo-${locationId}`, status: 'WORK_IN_PROGRESS', locationId,
    });

    it('ignores a slow response for a location that is no longer selected', () => {
      const first$ = new Subject<WorkorderWipView[]>();
      const second$ = new Subject<WorkorderWipView[]>();
      serviceMock.listActiveWorkorders.mockReturnValueOnce(first$).mockReturnValueOnce(second$);

      component.loadLocation('loc-1');
      component.loadLocation('loc-2');
      second$.next([rowFor('loc-2')]);
      second$.complete();
      first$.next([rowFor('loc-1')]);
      first$.complete();

      expect(component.state()).toBe('ready');
      expect(component.wipItems()).toEqual([rowFor('loc-2')]);
    });

    it('ignores a late failure from a superseded read', () => {
      const first$ = new Subject<WorkorderWipView[]>();
      serviceMock.listActiveWorkorders.mockReturnValueOnce(first$).mockReturnValueOnce(of([rowFor('loc-2')]));

      component.loadLocation('loc-1');
      component.loadLocation('loc-2');
      first$.error(new Error('late'));

      expect(component.state()).toBe('ready');
      expect(component.errorKey()).toBeNull();
    });

    it('ignores a read that lands after the picker was cleared', () => {
      const first$ = new Subject<WorkorderWipView[]>();
      serviceMock.listActiveWorkorders.mockReturnValueOnce(first$);

      component.loadLocation('loc-1');
      component.loadLocation('');
      first$.next([rowFor('loc-1')]);

      expect(component.state()).toBe('idle');
      expect(component.wipItems()).toEqual([]);
    });
  });

  it('clears a stale error key when the picker is cleared (ADR-0031)', () => {
    serviceMock.listActiveWorkorders.mockReturnValue(throwError(() => new Error('boom')));
    component.loadLocation('loc-1');
    expect(component.errorKey()).toBe('WORKEXEC.WIP.ERROR.LOAD');

    component.loadLocation('');

    expect(component.state()).toBe('idle');
    expect(component.errorKey()).toBeNull();
  });

  it('sets error state before errorKey when refresh() fails', () => {
    serviceMock.listActiveWorkorders.mockReturnValue(throwError(() => new Error('refresh fail')));

    component.locationId.set('loc-1');
    component.refresh();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('WORKEXEC.WIP.ERROR.LOAD');
  });
});
