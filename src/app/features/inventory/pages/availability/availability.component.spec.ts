import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AvailabilityComponent } from './availability.component';
import { InventoryDomainService } from '../../services/inventory.service';
import { AvailabilityView } from '../../models/inventory.models';

describe('AvailabilityComponent', () => {
  const serviceStub = { queryAvailability: vi.fn() };

  const mockView: AvailabilityView = {
    productSku: 'SKU-001',
    locationId: 'loc-01',
    onHandQuantity: 10,
    allocatedQuantity: 2,
    availableToPromiseQuantity: 8,
    unitOfMeasure: 'EA',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AvailabilityComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryDomainService, useValue: serviceStub },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts in idle state', () => {
    const fixture = TestBed.createComponent(AvailabilityComponent);
    const comp = fixture.componentInstance;
    expect(comp.state()).toBe('idle');
  });

  it('sets state to ready when results are returned', () => {
    serviceStub.queryAvailability.mockReturnValueOnce(of([mockView]));
    const fixture = TestBed.createComponent(AvailabilityComponent);
    const comp = fixture.componentInstance;
    comp.skuInput.set('SKU-001');
    comp.search();
    expect(comp.state()).toBe('ready');
    expect(comp.results()).toEqual([mockView]);
  });

  it('sets state to empty when no results', () => {
    serviceStub.queryAvailability.mockReturnValueOnce(of([]));
    const fixture = TestBed.createComponent(AvailabilityComponent);
    const comp = fixture.componentInstance;
    comp.skuInput.set('SKU-001');
    comp.search();
    expect(comp.state()).toBe('empty');
  });

  it('sets state error then errorKey on failure', () => {
    serviceStub.queryAvailability.mockReturnValueOnce(throwError(() => new Error('fail')));
    const fixture = TestBed.createComponent(AvailabilityComponent);
    const comp = fixture.componentInstance;
    comp.skuInput.set('SKU-001');

    const calls: string[] = [];
    const origState = comp.state.set.bind(comp.state);
    vi.spyOn(comp.state, 'set').mockImplementation((v: string) => { calls.push('state:' + v); origState(v as never); });
    const origErrKey = comp.errorKey.set.bind(comp.errorKey);
    vi.spyOn(comp.errorKey, 'set').mockImplementation((v: string | null) => { if (v !== null) calls.push('errKey:' + v); origErrKey(v); });

    comp.search();

    expect(comp.state()).toBe('error');
    expect(comp.errorKey()).toBe('INVENTORY.AVAILABILITY.ERROR.LOAD');
    const stateIdx = calls.findIndex(c => c === 'state:error');
    const errIdx = calls.findIndex(c => c.startsWith('errKey:'));
    expect(stateIdx).toBeLessThan(errIdx);
  });
});
