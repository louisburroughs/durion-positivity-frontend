import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { WorkorderWipView } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { WipStatusPageComponent } from './wip-status-page.component';

describe('WipStatusPageComponent', () => {
  let fixture: ComponentFixture<WipStatusPageComponent>;
  let component: WipStatusPageComponent;

  const serviceMock = {
    listActiveWorkorders: vi.fn(),
  };

  beforeEach(async () => {
    serviceMock.listActiveWorkorders.mockReset();

    await TestBed.configureTestingModule({
      imports: [WipStatusPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: serviceMock },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WipStatusPageComponent);
    component = fixture.componentInstance;
  });

  it('starts idle without a selected location', () => {
    fixture.detectChanges();

    expect(component.state()).toBe('idle');
    expect(serviceMock.listActiveWorkorders).not.toHaveBeenCalled();
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

  it('sets error state before errorKey when refresh() fails', () => {
    serviceMock.listActiveWorkorders.mockReturnValue(throwError(() => new Error('refresh fail')));

    component.locationId.set('loc-1');
    component.refresh();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('WORKEXEC.WIP.ERROR.LOAD');
  });
});
