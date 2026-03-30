import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subject, throwError } from 'rxjs';
import { EstimateListItem } from '../../models/workexec.models';
import { WorkexecService } from '../../services/workexec.service';
import { EstimateListPageComponent } from './estimate-list-page.component';

describe('EstimateListPageComponent', () => {
  let fixture: ComponentFixture<EstimateListPageComponent>;
  let component: EstimateListPageComponent;
  let customerParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const serviceMock = {
    listEstimatesForCustomer: vi.fn(),
    listEstimatesForVehicle: vi.fn(),
  };

  beforeEach(async () => {
    customerParamMap$ = new BehaviorSubject(convertToParamMap({ customerId: 'cust-1' }));

    serviceMock.listEstimatesForCustomer.mockReset();
    serviceMock.listEstimatesForVehicle.mockReset();

    await TestBed.configureTestingModule({
      imports: [EstimateListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: serviceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: customerParamMap$.asObservable(),
            queryParamMap: new BehaviorSubject(convertToParamMap({})).asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EstimateListPageComponent);
    component = fixture.componentInstance;
  });

  it('renders loading state then ready state with estimate list', () => {
    const stream = new Subject<EstimateListItem[]>();
    const estimatesFixture: EstimateListItem[] = [
      {
        estimateId: 'est-1',
        workorderId: 'wo-1',
        customerId: 'cust-1',
        vehicleId: 'veh-1',
        status: 'OPEN',
        totalAmount: 100,
        currency: 'USD',
      },
    ];
    serviceMock.listEstimatesForCustomer.mockReturnValue(stream.asObservable());

    fixture.detectChanges();

    expect(component.state()).toBe('loading');
    expect(fixture.nativeElement.querySelector('[data-testid="estimate-list-page"]')?.dataset['state']).toBe('loading');

    stream.next(estimatesFixture);
    stream.complete();
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
    expect(component.estimates()).toEqual(estimatesFixture);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="estimate-row"]').length).toBe(1);
  });

  it('sets error state before errorKey when load fails', () => {
    serviceMock.listEstimatesForCustomer.mockReturnValue(throwError(() => new Error('boom')));
    const stateSetSpy = vi.spyOn(component.state, 'set');
    const errorKeySetSpy = vi.spyOn(component.errorKey, 'set');

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('WORKEXEC.ESTIMATE_LIST.ERROR.LOAD');

    const stateOrder = stateSetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    const errorKeyOrder = errorKeySetSpy.mock.invocationCallOrder.at(-1) ?? 0;
    expect(stateOrder).toBeLessThan(errorKeyOrder);
  });
});
