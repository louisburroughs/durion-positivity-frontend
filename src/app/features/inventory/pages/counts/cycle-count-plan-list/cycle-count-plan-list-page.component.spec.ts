import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CycleCountPlanListPageComponent } from './cycle-count-plan-list-page.component';
import { InventoryCycleCountService } from '../../../services/inventory-cycle-count.service';
import { CycleCountPlan } from '../../../models/inventory.models';

const mockCycleCountService = {
  getCycleCountPlans: vi.fn(),
};

const planFixture: CycleCountPlan[] = [
  {
    planId: 'plan-001',
    locationId: 'loc-01',
    zoneIds: ['zone-1', 'zone-2'],
    scheduledDate: '2026-05-01',
    status: 'PENDING',
  },
];

describe('CycleCountPlanListPageComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CycleCountPlanListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryCycleCountService, useValue: mockCycleCountService },
      ],
    }).compileComponents();
  });

  it('loads plans and sets state to ready', () => {
    mockCycleCountService.getCycleCountPlans.mockReturnValue(of(planFixture));
    const fixture = TestBed.createComponent(CycleCountPlanListPageComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('ready');
    expect(component.plans()).toEqual(planFixture);
  });

  it('sets state to empty when plans array is empty', () => {
    mockCycleCountService.getCycleCountPlans.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(CycleCountPlanListPageComponent);
    const component = fixture.componentInstance;

    expect(component.state()).toBe('empty');
    expect(component.plans()).toEqual([]);
  });

  it('sets state to error before errorKey on load failure (ADR-0031)', () => {
    mockCycleCountService.getCycleCountPlans.mockReturnValue(
      throwError(() => new Error('network error')),
    );
    const fixture = TestBed.createComponent(CycleCountPlanListPageComponent);
    const component = fixture.componentInstance;

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

    component.loadPlans();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe('INVENTORY.COUNTS.PLANS.ERROR.LOAD');
  });
});
