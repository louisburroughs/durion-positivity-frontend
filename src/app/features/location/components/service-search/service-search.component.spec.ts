import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import enUS from '../../../../../assets/i18n/en-US.json';
import { ClaimableService, LocationService } from '../../services/location.service';
import { ServiceSearchComponent } from './service-search.component';

const tpms: ClaimableService = { operationCode: 'TPMS-SENSOR-SERVICE', name: 'TPMS sensor service', operationCategory: null };
const patch: ClaimableService = { operationCode: 'TIRE-REPAIR-PATCH-PLUG', name: 'Tire repair, patch/plug', operationCategory: null };

const locationServiceStub = {
  searchClaimableServices: vi.fn<(query: string) => Observable<{ services: ClaimableService[]; ok: boolean }>>(),
};

describe('ServiceSearchComponent', () => {
  let fixture: ComponentFixture<ServiceSearchComponent>;
  let component: ServiceSearchComponent;
  const settle = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    fixture.detectChanges();
  };
  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.searchClaimableServices.mockReturnValue(of({ services: [tpms, patch], ok: true }));
    await TestBed.configureTestingModule({
      imports: [ServiceSearchComponent, TranslateModule.forRoot()],
      providers: [{ provide: LocationService, useValue: locationServiceStub }],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(ServiceSearchComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('inputId', 'capability-search');
    fixture.componentRef.setInput('labelKey', 'LOCATION.MOBILE_UNITS.FIND_CAPABILITY');
    fixture.componentRef.setInput('selectedCodes', ['TIRE-REPAIR-PATCH-PLUG']);
    fixture.detectChanges();
  });

  it('labels the input and wires its hint', () => {
    const input = (fixture.nativeElement as HTMLElement).querySelector('#capability-search')!;
    expect((fixture.nativeElement as HTMLElement).querySelector('label')?.textContent?.trim()).toBe(
      'Find a capability to add',
    );
    expect(input.getAttribute('aria-describedby')).toBe('capability-search-hint');
  });

  it('waits for two letters before searching', async () => {
    component.onQuery('t');
    await settle();
    expect(locationServiceStub.searchClaimableServices).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
  });

  it('lists matches, marks the ones already chosen, and emits the one added', async () => {
    const added: ClaimableService[] = [];
    component.serviceAdded.subscribe(service => added.push(service));

    component.onQuery(' tire ');
    await settle();

    expect(locationServiceStub.searchClaimableServices).toHaveBeenCalledWith('tire');
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.add-service-btn'));
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['Add TPMS sensor service']);
    expect(text()).toContain('Already added');

    buttons[0].click();
    component.add(patch);
    expect(added).toEqual([tpms]);
  });

  it('says a failed search failed, rather than that nothing matched', async () => {
    locationServiceStub.searchClaimableServices.mockReturnValue(of({ services: [], ok: false }));
    component.onQuery('tire');
    await settle();
    expect(text()).toContain("Couldn't search the service catalog.");
    expect(text()).not.toContain('No services match.');
  });
});
