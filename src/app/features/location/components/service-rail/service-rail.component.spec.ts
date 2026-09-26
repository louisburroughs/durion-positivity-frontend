import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, of } from 'rxjs';
import enUS from '../../../../../assets/i18n/en-US.json';
import { ClaimableService, LocationService } from '../../services/location.service';
import { ServiceRailComponent } from './service-rail.component';

const rotation: ClaimableService = { operationCode: 'TIRE-ROTATION', name: 'Tire rotation', operationCategory: 'TIRE_SERVICE' };
const oil: ClaimableService = { operationCode: 'OIL-CHANGE', name: 'Oil change', operationCategory: 'MAINTENANCE' };
const odd: ClaimableService = { operationCode: 'ODD-JOB', name: 'Odd job', operationCategory: null };

const locationServiceStub = {
  searchClaimableServices: vi.fn<(query: string) => Observable<{ services: ClaimableService[]; ok: boolean }>>(),
};

describe('ServiceRailComponent', () => {
  let fixture: ComponentFixture<ServiceRailComponent>;
  let component: ServiceRailComponent;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const settle = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.searchClaimableServices.mockReturnValue(of({ services: [odd, oil, rotation], ok: true }));
    await TestBed.configureTestingModule({
      imports: [ServiceRailComponent, TranslateModule.forRoot()],
      providers: [{ provide: LocationService, useValue: locationServiceStub }],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    fixture = TestBed.createComponent(ServiceRailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('keyboardRouteKey', 'LOCATION.BAYS.RAIL.KEYBOARD_ROUTE');
    fixture.componentRef.setInput('draggable', true);
    fixture.componentRef.setInput('describe', (code: string) =>
      code === 'OIL-CHANGE' ? { key: 'LOCATION.BAYS.RAIL.ONLY', params: { bay: 'Bay 3' } } : null,
    );
    fixture.detectChanges();
  });

  it('groups results by category, in a fixed order with the uncategorised last', async () => {
    const found: ClaimableService[][] = [];
    component.servicesFound.subscribe(services => found.push(services));
    component.onQuery('ch');
    await settle();

    expect(Array.from(el().querySelectorAll('.rail-group h3')).map(h => h.textContent?.trim())).toEqual([
      'Tires',
      'Maintenance',
      'Other',
    ]);
    expect(el().textContent).toContain('Only Bay 3');
    expect(found).toEqual([[odd, oil, rotation]]);
  });

  it('labels each drag handle and points it at the keyboard route', async () => {
    component.onQuery('ch');
    await settle();
    const handle = el().querySelector('.handle')!;
    expect(handle.getAttribute('aria-label')).toBe('Drag Tire rotation');
    expect(handle.getAttribute('aria-describedby')).toBe('service-rail-keyboard');
    expect(el().querySelector('#service-rail-keyboard')?.textContent).toBe('Or use Add service on a bay card.');
  });

  it('shows no handles when the viewer cannot change the cards', async () => {
    fixture.componentRef.setInput('draggable', false);
    component.onQuery('ch');
    await settle();
    expect(el().querySelector('.handle')).toBeNull();
  });

  it('emits the dragged service and the end of the drag', async () => {
    const started: ClaimableService[] = [];
    let ended = 0;
    component.serviceDragStarted.subscribe(service => started.push(service));
    component.serviceDragEnded.subscribe(() => (ended += 1));
    component.onDragStart(oil, new DragEvent('dragstart'));
    component.onDragEnd();
    expect(started).toEqual([oil]);
    expect(ended).toBe(1);
  });

  it('takes a chip drop only while a remove target is set', () => {
    let removed = 0;
    component.removeDropped.subscribe(() => (removed += 1));
    const over = new DragEvent('dragover', { cancelable: true });
    component.onRemoveDragOver(over);
    expect(over.defaultPrevented).toBe(false);

    fixture.componentRef.setInput('removeTarget', {
      key: 'LOCATION.BAYS.DROP.REMOVE_ZONE',
      params: { service: 'Oil change', bay: 'Bay 3' },
    });
    fixture.detectChanges();
    expect(el().querySelector('.remove-zone')?.textContent).toContain('Drop here to remove Oil change from Bay 3');
    const overAgain = new DragEvent('dragover', { cancelable: true });
    component.onRemoveDragOver(overAgain);
    expect(overAgain.defaultPrevented).toBe(true);
    component.onRemoveDrop(new DragEvent('drop', { cancelable: true }));
    expect(removed).toBe(1);
  });

  it('retries a failed search for the same term', async () => {
    locationServiceStub.searchClaimableServices.mockReturnValueOnce(of({ services: [], ok: false }));
    component.onQuery('oil');
    await settle();
    expect(component.state()).toBe('failed');
    el().querySelector<HTMLButtonElement>('.rail-error .link-btn')!.click();
    await settle();
    expect(locationServiceStub.searchClaimableServices).toHaveBeenCalledTimes(2);
    expect(component.state()).toBe('ready');
  });

  it('never lets a retried search answer over a newer query', async () => {
    const retried = new Subject<{ services: ClaimableService[]; ok: boolean }>();
    locationServiceStub.searchClaimableServices
      .mockReturnValueOnce(of({ services: [], ok: false }))
      .mockReturnValueOnce(retried);
    component.onQuery('oil');
    await settle();
    component.retry();
    await settle();
    expect(retried.observed).toBe(true);

    component.onQuery('tire');
    retried.next({ services: [{ operationCode: 'OIL-CHANGE', name: 'Oil change' } as ClaimableService], ok: true });
    expect(component.results()).toEqual([]);
    expect(component.state()).toBe('loading');
  });
});
