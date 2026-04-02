import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { InventoryCycleCountService } from './inventory-cycle-count.service';
import {
  AdjustmentDetail,
  AdjustmentPageResponse,
  ApprovalQueueFilter,
  CountSubmitRequest,
  CountSubmitResponse,
  CycleCountPlan,
  CycleCountPlanRequest,
  CycleCountTask,
} from '../models/inventory.models';

describe('InventoryCycleCountService', () => {
  let service: InventoryCycleCountService;

  const apiStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryCycleCountService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(InventoryCycleCountService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── getCycleCountTask() ────────────────────────────────────────────────

  describe('getCycleCountTask()', () => {
    const mockTask: CycleCountTask = {
      cycleCountTaskId: 'task-001',
      locationId: 'loc-01',
      productSku: 'SKU-001',
      uom: 'EA',
      status: 'PENDING',
    };

    it('calls GET /inventory/v1/cycle-counts/tasks/{taskId}', () => {
      apiStub.get.mockReturnValueOnce(of(mockTask));

      service.getCycleCountTask('task-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/cycle-counts/tasks/task-001');
    });

    it('URL-encodes the taskId', () => {
      apiStub.get.mockReturnValueOnce(of(mockTask));

      service.getCycleCountTask('task/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/cycle-counts/tasks/task%2F001');
    });

    it('returns the CycleCountTask emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockTask));

      let result: CycleCountTask | undefined;
      service.getCycleCountTask('task-001').subscribe(r => (result = r));

      expect(result).toEqual(mockTask);
    });
  });

  // ── submitCount() ──────────────────────────────────────────────────────

  describe('submitCount()', () => {
    const mockRequest: CountSubmitRequest = {
      entries: [{ sequence: 1, countedQuantity: 95 }],
    };
    const mockResponse: CountSubmitResponse = {
      cycleCountTaskId: 'task-001',
      status: 'SUBMITTED',
      entries: [{ sequence: 1, timestamp: '2026-03-01T09:00:00Z', countedQuantity: 95, countedBy: 'user-01' }],
    };

    it('calls POST /inventory/v1/cycle-counts/tasks/{taskId}/entries with CountSubmitRequest body', () => {
      apiStub.post.mockReturnValueOnce(of(mockResponse));

      service.submitCount('task-001', mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/cycle-counts/tasks/task-001/entries');
      expect(body).toEqual(mockRequest);
    });

    it('URL-encodes the taskId', () => {
      apiStub.post.mockReturnValueOnce(of(mockResponse));

      service.submitCount('task/001', mockRequest).subscribe();

      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/cycle-counts/tasks/task%2F001/entries');
    });

    it('returns the CountSubmitResponse emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockResponse));

      let result: CountSubmitResponse | undefined;
      service.submitCount('task-001', mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResponse);
    });
  });

  // ── queryAdjustments() ────────────────────────────────────────────────

  describe('queryAdjustments()', () => {
    const mockPage: AdjustmentPageResponse = {
      items: [],
      nextPageToken: null,
    };

    it('calls GET /inventory/v1/adjustments with filter params', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      const filter: ApprovalQueueFilter = { locationId: 'loc-01', status: 'PENDING' };
      service.queryAdjustments(filter).subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/adjustments');
      expect(params.get('locationId')).toBe('loc-01');
    });

    it('omits filter params that are not provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      service.queryAdjustments({}).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect(params.has('locationId')).toBe(false);
      expect(params.has('productSku')).toBe(false);
    });

    it('returns the AdjustmentPageResponse emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      let result: AdjustmentPageResponse | undefined;
      service.queryAdjustments({}).subscribe(r => (result = r));

      expect(result).toEqual(mockPage);
    });
  });

  // ── getAdjustmentDetail() ──────────────────────────────────────────────

  describe('getAdjustmentDetail()', () => {
    const mockAdjustment: AdjustmentDetail = {
      adjustmentId: 'adj-001',
      locationId: 'loc-01',
      productSku: 'SKU-001',
      countedQuantity: 97,
      expectedQuantity: 100,
      varianceQuantity: -3,
      status: 'PENDING',
      requiredApprovalTier: 1,
    };

    it('calls GET /inventory/v1/adjustments/{adjustmentId}', () => {
      apiStub.get.mockReturnValueOnce(of(mockAdjustment));

      service.getAdjustmentDetail('adj-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/adjustments/adj-001');
    });

    it('URL-encodes the adjustmentId', () => {
      apiStub.get.mockReturnValueOnce(of(mockAdjustment));

      service.getAdjustmentDetail('adj/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/adjustments/adj%2F001');
    });

    it('returns the AdjustmentDetail emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockAdjustment));

      let result: AdjustmentDetail | undefined;
      service.getAdjustmentDetail('adj-001').subscribe(r => (result = r));

      expect(result).toEqual(mockAdjustment);
    });
  });

  // ── approveAdjustment() ────────────────────────────────────────────────

  describe('approveAdjustment()', () => {
    const mockAdjustment: AdjustmentDetail = {
      adjustmentId: 'adj-001',
      locationId: 'loc-01',
      productSku: 'SKU-001',
      countedQuantity: 97,
      expectedQuantity: 100,
      varianceQuantity: -3,
      status: 'APPROVED',
      requiredApprovalTier: 1,
    };

    it('calls POST /inventory/v1/adjustments/{adjustmentId}/approve with empty body', () => {
      apiStub.post.mockReturnValueOnce(of(mockAdjustment));

      service.approveAdjustment('adj-001').subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/adjustments/adj-001/approve');
    });

    it('URL-encodes the adjustmentId', () => {
      apiStub.post.mockReturnValueOnce(of(mockAdjustment));

      service.approveAdjustment('adj/001').subscribe();

      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/adjustments/adj%2F001/approve');
    });
  });

  // ── rejectAdjustment() ────────────────────────────────────────────────

  describe('rejectAdjustment()', () => {
    it('calls POST /inventory/v1/adjustments/{adjustmentId}/reject with rejectionReason in body', () => {
      apiStub.post.mockReturnValueOnce(of(undefined));

      service.rejectAdjustment('adj-001', 'Count error').subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/adjustments/adj-001/reject');
      expect((body as { rejectionReason: string }).rejectionReason).toBe('Count error');
    });

    it('URL-encodes the adjustmentId', () => {
      apiStub.post.mockReturnValueOnce(of(undefined));

      service.rejectAdjustment('adj/001', 'reason').subscribe();

      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/adjustments/adj%2F001/reject');
    });

    it('sends the rejection reason as body content', () => {
      apiStub.post.mockReturnValueOnce(of(undefined));

      service.rejectAdjustment('adj-001', 'Inaccurate count').subscribe();

      const [, body] = apiStub.post.mock.calls[0];
      expect((body as { rejectionReason: string }).rejectionReason).toBe('Inaccurate count');
    });
  });

  // ── getCycleCountPlans() ───────────────────────────────────────────────

  describe('getCycleCountPlans()', () => {
    const mockPlans: CycleCountPlan[] = [
      {
        planId: 'plan-001',
        locationId: 'loc-01',
        zoneIds: ['zone-1', 'zone-2'],
        scheduledDate: '2026-05-01',
        status: 'PENDING',
      },
    ];

    it('calls GET /inventory/v1/cycle-count-plans', () => {
      apiStub.get.mockReturnValueOnce(of(mockPlans));

      service.getCycleCountPlans().subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/cycle-count-plans');
    });

    it('includes locationId param when provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockPlans));

      service.getCycleCountPlans('loc-01').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect(params.get('locationId')).toBe('loc-01');
    });

    it('omits locationId param when not provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockPlans));

      service.getCycleCountPlans().subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect(params.has('locationId')).toBe(false);
    });

    it('returns the CycleCountPlan array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockPlans));

      let result: CycleCountPlan[] | undefined;
      service.getCycleCountPlans().subscribe(r => (result = r));

      expect(result).toEqual(mockPlans);
    });
  });

  // ── createCycleCountPlan() ─────────────────────────────────────────────

  describe('createCycleCountPlan()', () => {
    const mockRequest: CycleCountPlanRequest = {
      locationId: 'loc-01',
      zoneIds: ['zone-1'],
      scheduledDate: '2026-05-15',
    };

    const mockPlan: CycleCountPlan = {
      planId: 'plan-002',
      locationId: 'loc-01',
      zoneIds: ['zone-1'],
      scheduledDate: '2026-05-15',
      status: 'PENDING',
    };

    it('calls POST /inventory/v1/cycle-count-plans with request body', () => {
      apiStub.post.mockReturnValueOnce(of(mockPlan));

      service.createCycleCountPlan(mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/cycle-count-plans');
      expect(body).toEqual(mockRequest);
    });

    it('returns the created CycleCountPlan emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockPlan));

      let result: CycleCountPlan | undefined;
      service.createCycleCountPlan(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockPlan);
    });
  });
});
