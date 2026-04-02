import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ShortageResolutionPageComponent } from './shortage-resolution-page.component';
import { InventoryDomainService } from '../../../services/inventory.service';
import { ShortageOption, ShortageResolutionResult } from '../../../models/inventory.models';

const mockInventoryService = {
  getShortageOptions: vi.fn(),
  resolveShortage: vi.fn(),
};

const optionsFixture: ShortageOption[] = [
  { optionId: 'opt-01', decisionType: 'SUBSTITUTE', label: 'Use a substitute part' },
  { optionId: 'opt-02', decisionType: 'BACKORDER', label: 'Backorder', leadTimeDays: 3 },
];

const resolvedFixture: ShortageResolutionResult = {
  allocationLineId: 'alloc-001',
  resolvedDecisionType: 'SUBSTITUTE',
};

function buildRoute(workorderId: string | null = 'wo-001', allocationLineId: string | null = 'alloc-001') {
  return {
    snapshot: {
      paramMap: {
        get: vi.fn().mockImplementation((key: string) => {
          if (key === 'workorderId') return workorderId;
          if (key === 'allocationLineId') return allocationLineId;
          return null;
        }),
      },
      queryParamMap: {
        get: vi.fn().mockReturnValue(null),
      },
    },
  };
}

async function setupShortageResolution(
  workorderId: string | null = 'wo-001',
  allocationLineId: string | null = 'alloc-001',
) {
  await TestBed.configureTestingModule({
    imports: [ShortageResolutionPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: InventoryDomainService, useValue: mockInventoryService },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId, allocationLineId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(ShortageResolutionPageComponent).componentInstance;
}

describe('ShortageResolutionPageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('options render in order received from service', async () => {
    mockInventoryService.getShortageOptions.mockReturnValue(of(optionsFixture));
    const component = await setupShortageResolution();

    expect(component.options()).toEqual(optionsFixture);
    expect(component.options()[0].optionId).toBe('opt-01');
    expect(component.options()[1].optionId).toBe('opt-02');
  });

  it('state is ready after successful options load', async () => {
    mockInventoryService.getShortageOptions.mockReturnValue(of(optionsFixture));
    const component = await setupShortageResolution();

    expect(component.state()).toBe('ready');
  });

  it('confirm does nothing when no option is selected', async () => {
    mockInventoryService.getShortageOptions.mockReturnValue(of(optionsFixture));
    const component = await setupShortageResolution();

    component.confirm();

    expect(mockInventoryService.resolveShortage).not.toHaveBeenCalled();
  });

  it('submit error sets state error before errorKey (ADR-0031)', async () => {
    mockInventoryService.getShortageOptions.mockReturnValue(of(optionsFixture));
    mockInventoryService.resolveShortage.mockReturnValue(
      throwError(() => new Error('resolve failed')),
    );
    const component = await setupShortageResolution();

    component.selectOption('opt-01');

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

    component.confirm();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe(
      'INVENTORY.FULFILLMENT.SHORTAGE_RESOLUTION.ERROR.SUBMIT',
    );
  });

  it('resolve success sets state to resolved', async () => {
    mockInventoryService.getShortageOptions.mockReturnValue(of(optionsFixture));
    mockInventoryService.resolveShortage.mockReturnValue(of(resolvedFixture));
    const component = await setupShortageResolution();

    component.selectOption('opt-01');
    component.confirm();

    expect(component.state()).toBe('resolved');
    expect(component.result()).toEqual(resolvedFixture);
  });
});
