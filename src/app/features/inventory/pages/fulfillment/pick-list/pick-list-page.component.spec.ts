import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, Subject } from 'rxjs';
import { PickListPageComponent } from './pick-list-page.component';
import { WorkexecService } from '../../../../workexec/services/workexec.service';
import { PickListView, PickTaskLine } from '../../../../workexec/models/workexec.models';

const mockWorkexecService = {
  getWorkorderPickList: vi.fn(),
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

function buildRoute(workorderId: string | null) {
  return {
    snapshot: { paramMap: { get: vi.fn().mockReturnValue(workorderId) } },
  };
}

async function setupPickList(workorderId: string | null = 'wo-001') {
  await TestBed.configureTestingModule({
    imports: [PickListPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: WorkexecService, useValue: mockWorkexecService },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(PickListPageComponent).componentInstance;
}

describe('PickListPageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loaded task list sets state ready', async () => {
    mockWorkexecService.getWorkorderPickList.mockReturnValue(of(pickListFixture));
    const component = await setupPickList();

    expect(component.state()).toBe('ready');
    expect(component.pickList()).toEqual(pickListFixture);
  });

  it('empty tasks array sets state empty', async () => {
    const emptyList: PickListView = { ...pickListFixture, tasks: [] };
    mockWorkexecService.getWorkorderPickList.mockReturnValue(of(emptyList));
    const component = await setupPickList();

    expect(component.state()).toBe('empty');
  });

  it('load error sets state.set("error") before errorKey.set() (ADR-0031)', async () => {
    const err = new Error('fail');
    const load$ = new Subject<PickListView>();
    mockWorkexecService.getWorkorderPickList.mockReturnValue(load$.asObservable());

    const component = await setupPickList();
    const stateSignal = component.state as WritableSignal<'idle' | 'loading' | 'empty' | 'ready' | 'error'>;
    const errorKeySignal = component.errorKey as WritableSignal<string | null>;
    const originalStateSet = stateSignal.set.bind(stateSignal);
    const originalErrorKeySet = errorKeySignal.set.bind(errorKeySignal);

    const calls: string[] = [];
    vi.spyOn(stateSignal, 'set').mockImplementation((value) => {
      calls.push(`state:${value}`);
      originalStateSet(value);
    });
    vi.spyOn(errorKeySignal, 'set').mockImplementation((value) => {
      calls.push(`key:${value}`);
      originalErrorKeySet(value);
    });

    load$.error(err);

    const errorStateIndex = calls.indexOf('state:error');
    const errorKeyIndex = calls.findIndex(call => call.startsWith('key:'));
    expect(errorStateIndex).toBeGreaterThanOrEqual(0);
    expect(errorKeyIndex).toBeGreaterThan(errorStateIndex);
  });
});
