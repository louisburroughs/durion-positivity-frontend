import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CycleCountPlanFormPageComponent } from './cycle-count-plan-form-page.component';
import { InventoryCycleCountService } from '../../../services/inventory-cycle-count.service';
import { InventoryDomainService } from '../../../services/inventory.service';
import { CycleCountPlanRequest, LocationRef } from '../../../models/inventory.models';

const mockCycleCountService = {
  createCycleCountPlan: vi.fn(),
};

const mockInventoryDomainService = {
  getLocations: vi.fn(),
  getLocationZones: vi.fn(),
};

const locationFixture: LocationRef[] = [
  { locationId: 'loc-01', name: 'Main Warehouse', status: 'ACTIVE' },
];

const planRequestFixture: CycleCountPlanRequest = {
  locationId: 'loc-01',
  zoneIds: ['zone-1'],
  scheduledDate: '2099-12-31',
};

describe('CycleCountPlanFormPageComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockInventoryDomainService.getLocations.mockReturnValue(of(locationFixture));
    await TestBed.configureTestingModule({
      imports: [CycleCountPlanFormPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryCycleCountService, useValue: mockCycleCountService },
        { provide: InventoryDomainService, useValue: mockInventoryDomainService },
      ],
    }).compileComponents();
  });

  it('canSubmit is false when locationId is empty', () => {
    const fixture = TestBed.createComponent(CycleCountPlanFormPageComponent);
    const component = fixture.componentInstance;

    component.locationId.set('');
    component.zoneIds.set(['zone-1']);
    component.scheduledDate.set('2099-12-31');

    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when zoneIds is empty', () => {
    const fixture = TestBed.createComponent(CycleCountPlanFormPageComponent);
    const component = fixture.componentInstance;

    component.locationId.set('loc-01');
    component.zoneIds.set([]);
    component.scheduledDate.set('2099-12-31');

    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is true when scheduledDate is today', () => {
    const fixture = TestBed.createComponent(CycleCountPlanFormPageComponent);
    const component = fixture.componentInstance;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    component.locationId.set('loc-01');
    component.zoneIds.set(['zone-1']);
    component.scheduledDate.set(todayStr);

    expect(component.canSubmit()).toBe(true);
  });

  it('canSubmit is false when scheduledDate is in the past', () => {
    const fixture = TestBed.createComponent(CycleCountPlanFormPageComponent);
    const component = fixture.componentInstance;

    component.locationId.set('loc-01');
    component.zoneIds.set(['zone-1']);
    component.scheduledDate.set('2000-01-01');

    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is true when locationId, zoneIds, and future date are all provided', () => {
    const fixture = TestBed.createComponent(CycleCountPlanFormPageComponent);
    const component = fixture.componentInstance;

    component.locationId.set('loc-01');
    component.zoneIds.set(['zone-1']);
    component.scheduledDate.set('2099-12-31');

    expect(component.canSubmit()).toBe(true);
  });

  it('submit error sets state error then errorKey (ADR-0031)', () => {
    mockCycleCountService.createCycleCountPlan.mockReturnValue(
      throwError(() => new Error('submit failed')),
    );
    const fixture = TestBed.createComponent(CycleCountPlanFormPageComponent);
    const component = fixture.componentInstance;

    component.locationId.set(planRequestFixture.locationId);
    component.zoneIds.set(planRequestFixture.zoneIds);
    component.scheduledDate.set(planRequestFixture.scheduledDate);

    const calls: string[] = [];
    const origState = component.state.set.bind(component.state);
    const origError = component.errorKey.set.bind(component.errorKey);
    vi.spyOn(component.state, 'set').mockImplementation(v => {
      calls.push(`state:${v}`);
      origState(v);
    });
    vi.spyOn(component.errorKey, 'set').mockImplementation(v => {
      if (v !== null) calls.push(`errorKey:${v}`);
      origError(v);
    });

    component.submitPlan();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe('INVENTORY.COUNTS.PLANS.ERROR.SUBMIT');
  });
});
