import { WritableSignal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService, TranslationObject } from '@ngx-translate/core';
import { of, Subject, throwError } from 'rxjs';
import { PickListPageComponent } from './pick-list-page.component';
import { InventoryPickService } from '../../../services/inventory-pick.service';
import { PickListView, PickTaskLine } from '../../../models/inventory-pick.models';
import enUS from '../../../../../../assets/i18n/en-US.json';

const mockPickService = {
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

async function setupPickListFixture(workorderId: string | null = 'wo-001') {
  await TestBed.configureTestingModule({
    imports: [PickListPageComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: InventoryPickService, useValue: mockPickService },
      { provide: ActivatedRoute, useValue: buildRoute(workorderId) },
    ],
  }).compileComponents();
  return TestBed.createComponent(PickListPageComponent);
}

async function setupPickList(workorderId: string | null = 'wo-001') {
  return (await setupPickListFixture(workorderId)).componentInstance;
}

describe('PickListPageComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loaded task list sets state ready', async () => {
    mockPickService.getWorkorderPickList.mockReturnValue(of(pickListFixture));
    const component = await setupPickList();

    expect(component.state()).toBe('ready');
    expect(component.pickList()).toEqual(pickListFixture);
  });

  it('empty tasks array sets state empty', async () => {
    const emptyList: PickListView = { ...pickListFixture, tasks: [] };
    mockPickService.getWorkorderPickList.mockReturnValue(of(emptyList));
    const component = await setupPickList();

    expect(component.state()).toBe('empty');
  });

  // The adapter contract (#201) is that `tasks` is always an array, so this
  // page relies on it without guarding and treats an empty array as the empty
  // state. The service is mocked here; the header-only-cast regression itself
  // is covered in inventory-pick.service.spec.ts.
  it('always receives tasks as an array from the adapter contract', async () => {
    const emptyList: PickListView = { ...pickListFixture, tasks: [] };
    mockPickService.getWorkorderPickList.mockReturnValue(of(emptyList));
    const component = await setupPickList();

    expect(Array.isArray(component.pickList()?.tasks)).toBe(true);
    expect(component.pickList()?.tasks).toHaveLength(0);
    expect(component.state()).toBe('empty');
  });

  // The service emits null when the workorder has no pick list yet (#286).
  it('no pick list (null) sets state empty, not error', async () => {
    mockPickService.getWorkorderPickList.mockReturnValue(of(null));
    const component = await setupPickList();

    expect(component.state()).toBe('empty');
    expect(component.errorKey()).toBeNull();
    expect(component.pickList()).toBeNull();
  });

  // Only the service may decide a 404 means "no pick list"; one that reaches
  // the page (e.g. from the task read) is a real failure.
  it('a load error that reaches the page sets state error, even a 404', async () => {
    mockPickService.getWorkorderPickList.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    const component = await setupPickList();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_LIST.ERROR.LOAD');
  });

  it('reload() re-fetches pick list and sets state to ready', async () => {
    mockPickService.getWorkorderPickList
      .mockReturnValueOnce(throwError(() => new Error('initial fail')))
      .mockReturnValueOnce(of(pickListFixture));

    const component = await setupPickList();
    expect(component.state()).toBe('error');

    component.reload();

    expect(component.state()).toBe('ready');
    expect(component.pickList()).toEqual(pickListFixture);
  });

  it('load error sets state.set("error") before errorKey.set() (ADR-0031)', async () => {
    const err = new Error('fail');
    const load$ = new Subject<PickListView>();
    mockPickService.getWorkorderPickList.mockReturnValue(load$.asObservable());

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

  // #2221: existing tasks stay null until their next pick-task fact replicates
  // storageLocationCode — the raw storageLocationId UUID must never leak into
  // rendered text as a fallback (ADR-0064 §5).
  describe('location column falls back to COMMON.NOT_AVAILABLE, never the raw storageLocationId (#2221)', () => {
    it('shows the location code when present', async () => {
      const withCode: PickTaskLine = { ...pickTaskLine, storageLocationId: 'loc-uuid-001', storageLocationCode: 'A-01-03' };
      mockPickService.getWorkorderPickList.mockReturnValue(of({ ...pickListFixture, tasks: [withCode] }));
      const fixture = await setupPickListFixture();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('A-01-03');
      expect(text).not.toContain('loc-uuid-001');
    });

    it('falls back to COMMON.NOT_AVAILABLE, never the raw storageLocationId, when no code exists yet', async () => {
      const withoutCode: PickTaskLine = { ...pickTaskLine, storageLocationId: 'loc-uuid-001' };
      mockPickService.getWorkorderPickList.mockReturnValue(of({ ...pickListFixture, tasks: [withoutCode] }));
      const fixture = await setupPickListFixture();
      // Real en-US bundle (ADR-0035 §8): asserting the translated text, not the
      // key, proves the fallback is actually wired to a user-visible string.
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en-US', enUS as TranslationObject);
      translate.use('en-US');
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent as string;
      expect(text).not.toContain('loc-uuid-001');
      expect(text).not.toContain('COMMON.NOT_AVAILABLE');
      expect(text).toContain(enUS.COMMON.NOT_AVAILABLE);
    });
  });

  // #2204/#2225: the pick-facade reads are now location-scoped.
  describe('LOCATION_SCOPE_DENIED maps to a localized error (#2204/#2225)', () => {
    it('a 403 with the scope-denied code sets the dedicated error key', async () => {
      mockPickService.getWorkorderPickList.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 403, statusText: 'Forbidden', error: { code: 'LOCATION_SCOPE_DENIED' } }),
        ),
      );
      const component = await setupPickList();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_LIST.ERROR.LOCATION_SCOPE_DENIED');
    });

    it('a plain 403 without the scope-denied code keeps the generic load error', async () => {
      mockPickService.getWorkorderPickList.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
      );
      const component = await setupPickList();

      expect(component.state()).toBe('error');
      expect(component.errorKey()).toBe('INVENTORY.FULFILLMENT.PICK_LIST.ERROR.LOAD');
    });
  });
});
