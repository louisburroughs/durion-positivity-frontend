import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { PickExecutePageComponent } from './pick-execute-page.component';
import { WorkexecService } from '../../../../workexec/services/workexec.service';
import { PickExecuteLine, PickListView, PickTaskLine } from '../../../../workexec/models/workexec.models';

const mockWorkexecService = {
  getWorkorderPickList: vi.fn(),
  resolvePickScan: vi.fn(),
  confirmPickLine: vi.fn(),
  completePickList: vi.fn(),
};

const pickTaskLine: PickTaskLine = {
  pickTaskId: 'task-001',
  productSku: 'SKU-001',
  requestedQty: 5,
  pickedQty: 0,
  uom: 'EA',
  status: 'PENDING',
};

const pickListFixture: PickListView = {
  workorderId: 'wo-001',
  pickListId: 'pl-001',
  status: 'OPEN',
  tasks: [pickTaskLine],
};

const executeLineFixture: PickExecuteLine = {
  pickLineId: 'pline-001',
  pickTaskId: 'task-001',
  productSku: 'SKU-001',
  requestedQty: 5,
  confirmedQty: 0,
  status: 'PENDING',
};

function buildRoute(workorderId: string | null = 'wo-001') {
  return {
    snapshot: { paramMap: { get: vi.fn().mockReturnValue(workorderId) } },
  };
}

async function setupPickExecute(workorderId: string | null = 'wo-001') {
  await TestBed.configureTestingModule({
    imports: [PickExecutePageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: WorkexecService, useValue: mockWorkexecService },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(PickExecutePageComponent).componentInstance;
}

describe('PickExecutePageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkexecService.getWorkorderPickList.mockReturnValue(of(pickListFixture));
  });

  it('initial load sets state ready and populates lines', async () => {
    const component = await setupPickExecute();

    expect(component.state()).toBe('ready');
    expect(component.lines().length).toBeGreaterThan(0);
  });

  it('scan resolve success sets pendingLine', async () => {
    mockWorkexecService.resolvePickScan.mockReturnValue(of([executeLineFixture]));
    const component = await setupPickExecute();

    component.setScanInput('BARCODE-123');
    component.resolveScan();

    expect(component.pendingLine()).toEqual(executeLineFixture);
  });

  it('scan error sets state error before errorKey (ADR-0031)', async () => {
    mockWorkexecService.resolvePickScan.mockReturnValue(
      throwError(() => new Error('scan failed')),
    );
    const component = await setupPickExecute();

    component.setScanInput('BARCODE-BAD');

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

    component.resolveScan();

    const errIdx = calls.findIndex(c => c.startsWith('state:error'));
    const keyIdx = calls.findIndex(c => c.startsWith('errorKey:'));
    expect(errIdx).toBeGreaterThanOrEqual(0);
    expect(keyIdx).toBeGreaterThan(errIdx);
    expect(component.errorKey()).toBe(
      'INVENTORY.FULFILLMENT.PICK_EXECUTE.ERROR.RESOLVE_SCAN',
    );
  });

  it('complete success sets state to complete', async () => {
    mockWorkexecService.completePickList.mockReturnValue(
      of({ status: 'COMPLETE' }),
    );
    const component = await setupPickExecute();

    component.complete();

    expect(component.state()).toBe('complete');
  });
});
