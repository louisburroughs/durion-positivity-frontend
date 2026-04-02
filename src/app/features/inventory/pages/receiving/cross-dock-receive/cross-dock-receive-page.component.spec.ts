import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CrossDockReceivePageComponent } from './cross-dock-receive-page.component';
import { InventoryReceivingService } from '../../../services/inventory-receiving.service';
import {
  CrossDockReceiveResult,
  WorkorderCrossDockRef,
} from '../../../models/inventory.models';

const mockReceivingService = {
  searchWorkordersForCrossDock: vi.fn(),
  submitCrossDockReceipt: vi.fn(),
};

const mockRoute = {
  snapshot: { queryParamMap: { get: vi.fn().mockReturnValue(null) } },
};

const resultFixture: CrossDockReceiveResult = {
  issueReferenceId: 'issue-001',
  issueMode: 'CROSS_DOCK',
};

const workorderCrossDockRefsFixture: WorkorderCrossDockRef[] = [
  {
    workorderId: 'wo-001',
    workorderNumber: 'WO-1001',
    status: 'OPEN',
  },
];

function buildReadyComponent() {
  const fixture = TestBed.createComponent(CrossDockReceivePageComponent);
  const component = fixture.componentInstance;
  component.sessionId.set('sess-001');
  component.receivingLineId.set('rl-001');
  component.workorderId.set('wo-001');
  component.workorderLineId.set('wol-001');
  component.quantity.set(3);
  return component;
}

describe('CrossDockReceivePageComponent', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [CrossDockReceivePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: InventoryReceivingService, useValue: mockReceivingService },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
  });

  it('submit success enters success state', () => {
    mockReceivingService.submitCrossDockReceipt.mockReturnValue(of(resultFixture));
    const component = buildReadyComponent();

    component.confirmCrossDockReceipt();

    expect(component.state()).toBe('success');
    expect(component.result()).toEqual(resultFixture);
  });

  it('submit error sets state error before errorKey (ADR-0031)', () => {
    mockReceivingService.submitCrossDockReceipt.mockReturnValue(
      throwError(() => new Error('submit failed')),
    );
    const component = buildReadyComponent();

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

    component.confirmCrossDockReceipt();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe('INVENTORY.RECEIVING.CROSS_DOCK.ERROR.SUBMIT');
  });

  it('searchWorkorders with empty query clears stale errorKey and returns to idle', () => {
    const component = TestBed.createComponent(CrossDockReceivePageComponent).componentInstance;

    component.errorKey.set('INVENTORY.RECEIVING.CROSS_DOCK.ERROR.SEARCH');
    component.workorders.set(workorderCrossDockRefsFixture);
    component.state.set('error');

    component.searchWorkorders('');

    expect(component.errorKey()).toBeNull();
    expect(component.workorders()).toEqual([]);
    expect(component.state()).toBe('idle');
  });

  it('resetSearch clears error and workorders, then sets state to idle', () => {
    const component = TestBed.createComponent(CrossDockReceivePageComponent).componentInstance;

    component.errorKey.set('INVENTORY.RECEIVING.CROSS_DOCK.ERROR.SUBMIT');
    component.workorders.set(workorderCrossDockRefsFixture);
    component.state.set('error');

    component.resetSearch();

    expect(component.errorKey()).toBeNull();
    expect(component.workorders()).toEqual([]);
    expect(component.state()).toBe('idle');
  });
});
