import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import enUS from '../../../../../assets/i18n/en-US.json';
import { Subject, of, throwError } from 'rxjs';
import { WorkorderFinalizePageComponent } from './workorder-finalize-page.component';
import { WorkexecService } from '../../services/workexec.service';
import { WorkorderSnapshotHistoryEntry } from '../../models/workexec.models';

const WORKORDER_ID = '01960020-0000-7000-8000-00000000002b';

const workexecServiceStub = {
  getSnapshotHistory: vi.fn(),
  finalizeWorkorder: vi.fn(),
};

const routerStub = { navigate: vi.fn() };

function entry(overrides: Partial<WorkorderSnapshotHistoryEntry> = {}): WorkorderSnapshotHistoryEntry {
  return { id: 'snap-1', workorderId: WORKORDER_ID, status: 'SUPERSEDED', ...overrides };
}

describe('WorkorderFinalizePageComponent', () => {
  let fixture: ComponentFixture<WorkorderFinalizePageComponent>;
  let component: WorkorderFinalizePageComponent;

  const setup = async () => {
    await TestBed.configureTestingModule({
      imports: [WorkorderFinalizePageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: WorkexecService, useValue: workexecServiceStub },
        { provide: Router, useValue: routerStub },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ workorderId: WORKORDER_ID }) } } },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');

    fixture = TestBed.createComponent(WorkorderFinalizePageComponent);
    component = fixture.componentInstance;
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  describe('ngOnInit() / loadSnapshots()', () => {
    it('reads the workorderId from the route and loads its snapshot history', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([entry()]));
      await setup();
      fixture.detectChanges();

      expect(component.workorderId()).toBe(WORKORDER_ID);
      expect(workexecServiceStub.getSnapshotHistory).toHaveBeenCalledWith(WORKORDER_ID);
      expect(component.pageState()).toBe('ready');
      expect(component.snapshots()).toEqual([entry()]);
    });

    it('drives loading state off a Subject rather than a synchronous of()', async () => {
      const subject = new Subject<WorkorderSnapshotHistoryEntry[]>();
      workexecServiceStub.getSnapshotHistory.mockReturnValue(subject.asObservable());
      await setup();
      fixture.detectChanges();

      expect(component.pageState()).toBe('loading');

      subject.next([]);
      subject.complete();
      expect(component.pageState()).toBe('ready');
    });

    it('treats a 404 as an empty history rather than an error', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(throwError(() => ({ status: 404 })));
      await setup();
      fixture.detectChanges();

      expect(component.pageState()).toBe('ready');
      expect(component.snapshots()).toEqual([]);
    });

    it('routes a non-404 failure to the error page state with a translated message', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(throwError(() => ({ status: 500 })));
      await setup();
      fixture.detectChanges();

      expect(component.pageState()).toBe('error');
      expect(component.errorMessage()).toBe('Failed to load snapshot history. Please try again.');
    });
  });

  describe('hasActiveSnapshot() / canFinalize()', () => {
    it('cannot finalize while an ACTIVE snapshot already exists', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([entry({ status: 'ACTIVE' })]));
      await setup();
      fixture.detectChanges();

      expect(component.hasActiveSnapshot()).toBe(true);
      expect(component.canFinalize()).toBe(false);
    });

    it('can finalize when no snapshot is ACTIVE', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([entry({ status: 'SUPERSEDED' })]));
      await setup();
      fixture.detectChanges();

      expect(component.hasActiveSnapshot()).toBe(false);
      expect(component.canFinalize()).toBe(true);
    });
  });

  describe('finalizeForBilling()', () => {
    it('is a no-op when canFinalize() is false', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([entry({ status: 'ACTIVE' })]));
      await setup();
      fixture.detectChanges();

      component.finalizeForBilling();

      expect(workexecServiceStub.finalizeWorkorder).not.toHaveBeenCalled();
    });

    it('submits the PO number, on success stores the result and reloads history', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([]));
      await setup();
      fixture.detectChanges();
      component.poNumber.set('PO-42');

      const finalized = {
        snapshotId: 'snap-2',
        workorderId: WORKORDER_ID,
        snapshotVersion: 1,
        snapshotStatus: 'ACTIVE',
      };
      workexecServiceStub.finalizeWorkorder.mockReturnValue(of(finalized));
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([entry({ status: 'ACTIVE' })]));

      component.finalizeForBilling();

      expect(workexecServiceStub.finalizeWorkorder).toHaveBeenCalledWith(
        WORKORDER_ID,
        { snapshotType: 'BILLABLE_SNAPSHOT', poNumber: 'PO-42' },
        expect.any(String),
      );
      expect(component.finalizeState()).toBe('success');
      expect(component.finalizeResult()).toEqual(finalized);
      expect(workexecServiceStub.getSnapshotHistory).toHaveBeenCalledTimes(2);
    });

    it('omits an empty PO number from the request body', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([]));
      await setup();
      fixture.detectChanges();

      workexecServiceStub.finalizeWorkorder.mockReturnValue(of({
        snapshotId: 'snap-3',
        workorderId: WORKORDER_ID,
        snapshotVersion: 1,
        snapshotStatus: 'ACTIVE',
      }));

      component.finalizeForBilling();

      expect(workexecServiceStub.finalizeWorkorder).toHaveBeenCalledWith(
        WORKORDER_ID,
        { snapshotType: 'BILLABLE_SNAPSHOT', poNumber: undefined },
        expect.any(String),
      );
    });

    it('drives the loading state off a Subject rather than a synchronous of()', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([]));
      await setup();
      fixture.detectChanges();

      const subject = new Subject<unknown>();
      workexecServiceStub.finalizeWorkorder.mockReturnValue(subject.asObservable());

      component.finalizeForBilling();
      expect(component.finalizeState()).toBe('loading');
      expect(component.canFinalize()).toBe(false);
    });

    it.each([
      [409, 'An active billable snapshot already exists for this work order.'],
      [500, 'Failed to finalize. Please try again.'],
    ] as const)('maps a %d failure to the matching translated error', async (status, message) => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([]));
      await setup();
      fixture.detectChanges();
      workexecServiceStub.finalizeWorkorder.mockReturnValue(throwError(() => ({ status })));

      component.finalizeForBilling();

      expect(component.finalizeState()).toBe('error');
      expect(component.finalizeError()).toBe(message);
    });

    it('surfaces the server message on a 400, falling back to the translated key', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([]));
      await setup();
      fixture.detectChanges();
      workexecServiceStub.finalizeWorkorder.mockReturnValue(
        throwError(() => ({ status: 400, error: { message: 'Missing labor totals' } })),
      );

      component.finalizeForBilling();

      expect(component.finalizeError()).toBe('Missing labor totals');
    });

    it('falls back to the translated requirements message when a 400 carries no server message', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([]));
      await setup();
      fixture.detectChanges();
      workexecServiceStub.finalizeWorkorder.mockReturnValue(throwError(() => ({ status: 400 })));

      component.finalizeForBilling();

      expect(component.finalizeError()).toBe(
        'Finalization requirements not met. Check for unauthorized items or missing totals.',
      );
    });
  });

  describe('goBack() / refresh()', () => {
    it('navigates back to the workorder detail page', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([]));
      await setup();
      fixture.detectChanges();

      component.goBack();

      expect(routerStub.navigate).toHaveBeenCalledWith(['/app/workexec/workorders', WORKORDER_ID]);
    });

    it('refresh() reloads the snapshot history for the current workorder', async () => {
      workexecServiceStub.getSnapshotHistory.mockReturnValue(of([]));
      await setup();
      fixture.detectChanges();
      expect(workexecServiceStub.getSnapshotHistory).toHaveBeenCalledTimes(1);

      component.refresh();

      expect(workexecServiceStub.getSnapshotHistory).toHaveBeenCalledTimes(2);
      expect(workexecServiceStub.getSnapshotHistory).toHaveBeenLastCalledWith(WORKORDER_ID);
    });
  });
});
