/**
 * InventoryPickService unit tests (CAP-218: Pick List & Picking Stories 92, 243, 244).
 *
 * Moved out of workexec.service.spec.ts (issue #347, group 5) — picking
 * belongs to inventory, even though a mechanic performs it on a workorder.
 */
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { BASE_PATH } from '@durion-sdk/workorder';
import { InventoryPickService } from './inventory-pick.service';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import {
  ConsumePickedItemsRequest,
  ConsumptionResult,
  PickConfirmRequest,
  PickExecuteLine,
  PickListView,
  PickedItemLine,
  ScanResolveRequest,
} from '../models/inventory-pick.models';

const BASE = environment.apiBaseUrl;

describe('InventoryPickService', () => {
  let service: InventoryPickService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        InventoryPickService,
        ApiBaseService,
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
      ],
    });
    service = TestBed.inject(InventoryPickService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getWorkorderPickList — composes the SDK header and task reads into one PickListView', () => {
    // The header endpoint carries no tasks; the tasks endpoint carries no
    // header. Neither fixture is shaped like the local model on purpose.
    const header = {
      workorderId: 'wo-001',
      pickListId: 'pl-001',
      status: 'READY_TO_PICK',
      createdAt: '2026-09-01T12:00:00Z',
      dueAt: '2026-09-02T12:00:00Z',
      priority: 1,
      updatedAt: '2026-09-01T12:00:00Z',
    };
    const tasks = [
      {
        locationId: 'bin-001',
        pickListId: 'pl-001',
        pickTaskId: 'task-001',
        pickedQty: 0,
        remainingQty: 5,
        requiredQty: 5,
        skuId: 'SKU-001',
        sortOrder: 1,
        status: 'PENDING',
        version: 0,
      },
    ];

    let result: PickListView | null | undefined;
    service.getWorkorderPickList('wo-001').subscribe(value => (result = value));

    const headerReq = http.expectOne(`${BASE}/v1/workorders/wo-001/pick-list`);
    expect(headerReq.request.method).toBe('GET');
    const tasksReq = http.expectOne(`${BASE}/v1/workorders/wo-001/pick-list/tasks`);
    expect(tasksReq.request.method).toBe('GET');
    headerReq.flush(header);
    tasksReq.flush(tasks);

    expect(result).toEqual({
      workorderId: 'wo-001',
      pickListId: 'pl-001',
      status: 'READY_TO_PICK',
      createdAt: '2026-09-01T12:00:00Z',
      tasks: [
        {
          pickTaskId: 'task-001',
          productSku: 'SKU-001',
          requestedQty: 5,
          pickedQty: 0,
          uom: 'EA',
          storageLocationId: 'bin-001',
          status: 'PENDING',
          sortOrder: 1,
        },
      ],
    });
  });

  it('getWorkorderPickList — an empty task read yields an empty tasks array, never undefined', () => {
    let result: PickListView | null | undefined;
    service.getWorkorderPickList('wo-001').subscribe(value => (result = value));

    http.expectOne(`${BASE}/v1/workorders/wo-001/pick-list`).flush({
      workorderId: 'wo-001',
      pickListId: 'pl-001',
      status: 'READY_TO_PICK',
      createdAt: '2026-09-01T12:00:00Z',
      dueAt: '2026-09-02T12:00:00Z',
      priority: 1,
      updatedAt: '2026-09-01T12:00:00Z',
    });
    http.expectOne(`${BASE}/v1/workorders/wo-001/pick-list/tasks`).flush([]);

    expect(result?.tasks).toEqual([]);
  });

  // #286: the header read 404s when the workorder has no pick list yet, while
  // the task read answers []. Only the header's 404 means "no pick list".
  it('getWorkorderPickList — a header 404 emits null (no pick list yet)', () => {
    let result: PickListView | null | undefined;
    let failed = false;
    service.getWorkorderPickList('wo-001').subscribe({
      next: value => (result = value),
      error: () => (failed = true),
    });

    http
      .expectOne(`${BASE}/v1/workorders/wo-001/pick-list`)
      .flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    http.expectOne(`${BASE}/v1/workorders/wo-001/pick-list/tasks`).flush([]);

    expect(failed).toBe(false);
    expect(result).toBeNull();
  });

  it('getWorkorderPickList — a task-read 404 still errors', () => {
    let status: number | undefined;
    service.getWorkorderPickList('wo-001').subscribe({
      error: err => (status = err.status),
    });

    http.expectOne(`${BASE}/v1/workorders/wo-001/pick-list`).flush({
      workorderId: 'wo-001',
      pickListId: 'pl-001',
      status: 'READY_TO_PICK',
    });
    http
      .expectOne(`${BASE}/v1/workorders/wo-001/pick-list/tasks`)
      .flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });

    expect(status).toBe(404);
  });

  it('getWorkorderPickList — a non-404 header failure still errors', () => {
    let status: number | undefined;
    service.getWorkorderPickList('wo-001').subscribe({
      error: err => (status = err.status),
    });

    http
      .expectOne(`${BASE}/v1/workorders/wo-001/pick-list`)
      .flush({ code: 'INTERNAL_ERROR' }, { status: 500, statusText: 'Server Error' });
    // forkJoin unsubscribes the sibling once the header errors.
    http.match(`${BASE}/v1/workorders/wo-001/pick-list/tasks`);

    expect(status).toBe(500);
  });

  it('getPickedItems — GET /workexec/v1/workorders/{workorderId}/picked-items', () => {
    const pickedFixture: PickedItemLine[] = [
      {
        pickedItemId: 'pi-001',
        productSku: 'SKU-001',
        qtyPicked: 5,
        qtyConsumed: 0,
        status: 'PICKED',
      },
    ];

    service.getPickedItems('wo-001').subscribe(result => {
      expect(result).toEqual(pickedFixture);
    });

    const req = http.expectOne(`${BASE}/v1/workorders/wo-001/picked-items`);
    expect(req.request.method).toBe('GET');
    req.flush(pickedFixture);
  });

  it('consumePickedItems — POST /workexec/v1/workorders/{workorderId}/picked-items/consume', () => {
    const consumeReq: ConsumePickedItemsRequest = { lines: [{ pickedItemId: 'pi-001', quantity: 3 }] };
    const consumeResult: ConsumptionResult = {
      referenceId: 'ref-001',
      consumedLineCount: 1,
    };

    service.consumePickedItems('wo-001', consumeReq).subscribe(result => {
      expect(result).toEqual(consumeResult);
    });

    const req = http.expectOne(
      `${BASE}/v1/workorders/wo-001/picked-items:consume`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body['items']).toHaveLength(1);
    req.flush(consumeResult);
  });

  it('resolvePickScan — POST /workexec/v1/workorders/{workorderId}/picks/resolve-scan', () => {
    const scanReq: ScanResolveRequest = { scanValue: 'BARCODE-123' };
    const executeLine: PickExecuteLine = {
      pickLineId: 'pline-001',
      pickTaskId: 'task-001',
      productSku: 'SKU-001',
      requestedQty: 5,
      confirmedQty: 0,
      status: 'PENDING',
    };

    service.resolvePickScan('wo-001', scanReq).subscribe(result => {
      expect(result).toEqual([executeLine]);
    });

    const req = http.expectOne(
      `${BASE}/workexec/v1/workorders/wo-001/picks/resolve-scan`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body['scanValue']).toBe('BARCODE-123');
    req.flush([executeLine]);
  });

  it('confirmPickLine — POST /workexec/v1/workorders/{workorderId}/picks/confirm', () => {
    const confirmReq: PickConfirmRequest = { pickLineId: 'pline-001', quantity: 5 };
    const confirmedLine: PickExecuteLine = {
      pickLineId: 'pline-001',
      pickTaskId: 'task-001',
      productSku: 'SKU-001',
      requestedQty: 5,
      confirmedQty: 5,
      status: 'CONFIRMED',
    };

    service.confirmPickLine('wo-001', confirmReq).subscribe(result => {
      expect(result).toEqual(confirmedLine);
    });

    const req = http.expectOne(
      `${BASE}/workexec/v1/workorders/wo-001/picks/confirm`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body['pickLineId']).toBe('pline-001');
    req.flush(confirmedLine);
  });

  it('completePickList — POST /workexec/v1/workorders/{workorderId}/picks/complete', () => {
    service.completePickList('wo-001').subscribe(result => {
      expect(result.status).toBe('COMPLETE');
    });

    const req = http.expectOne(
      `${BASE}/workexec/v1/workorders/wo-001/picks/complete`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'COMPLETE' });
  });
});
