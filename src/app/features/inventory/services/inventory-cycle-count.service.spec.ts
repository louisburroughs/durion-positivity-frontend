import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { CycleCountAPIService, CycleCountAdjustmentsService, CycleCountPlansService } from '@durion-sdk/inventory';
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

  const cycleCountSdkStub = { getTask: vi.fn(), submitCount: vi.fn() };
  const adjustmentsSdkStub = { listAdjustments: vi.fn(), getAdjustment: vi.fn(), approveAdjustment: vi.fn(), rejectAdjustment: vi.fn() };
  const plansSdkStub = { createPlan: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryCycleCountService,
        { provide: ApiBaseService, useValue: apiStub },
        { provide: CycleCountAPIService, useValue: cycleCountSdkStub },
        { provide: CycleCountAdjustmentsService, useValue: adjustmentsSdkStub },
        { provide: CycleCountPlansService, useValue: plansSdkStub },
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

    it('calls cycleCountSdk.getTask with the taskId', () => {
      cycleCountSdkStub.getTask.mockReturnValueOnce(of(mockTask));

      service.getCycleCountTask('task-001').subscribe();

      expect(cycleCountSdkStub.getTask).toHaveBeenCalledWith('task-001');
    });

    it('passes the taskId as-is to the SDK', () => {
      cycleCountSdkStub.getTask.mockReturnValueOnce(of(mockTask));

      service.getCycleCountTask('task/001').subscribe();

      expect(cycleCountSdkStub.getTask).toHaveBeenCalledWith('task/001');
    });

    it('returns the CycleCountTask emitted by the SDK', () => {
      cycleCountSdkStub.getTask.mockReturnValueOnce(of(mockTask));

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

    it('calls cycleCountSdk.submitCount with taskId merged into request', () => {
      cycleCountSdkStub.submitCount.mockReturnValueOnce(of(mockResponse));

      service.submitCount('task-001', mockRequest).subscribe();

      expect(cycleCountSdkStub.submitCount).toHaveBeenCalledWith({ ...mockRequest, taskId: 'task-001' });
    });

    it('passes the taskId as-is to the SDK', () => {
      cycleCountSdkStub.submitCount.mockReturnValueOnce(of(mockResponse));

      service.submitCount('task/001', mockRequest).subscribe();

      expect(cycleCountSdkStub.submitCount).toHaveBeenCalledWith({ ...mockRequest, taskId: 'task/001' });
    });

    it('returns the CountSubmitResponse emitted by the SDK', () => {
      cycleCountSdkStub.submitCount.mockReturnValueOnce(of(mockResponse));

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

    it('calls adjustmentsSdk.listAdjustments with the filter status', () => {
      adjustmentsSdkStub.listAdjustments.mockReturnValueOnce(of(mockPage));

      const filter: ApprovalQueueFilter = { locationId: 'loc-01', status: 'PENDING' };
      service.queryAdjustments(filter).subscribe();

      expect(adjustmentsSdkStub.listAdjustments).toHaveBeenCalledWith('PENDING');
    });

    it('passes undefined status when filter has no status', () => {
      adjustmentsSdkStub.listAdjustments.mockReturnValueOnce(of(mockPage));

      service.queryAdjustments({}).subscribe();

      expect(adjustmentsSdkStub.listAdjustments).toHaveBeenCalledWith(undefined);
    });

    it('returns the AdjustmentPageResponse emitted by the SDK', () => {
      adjustmentsSdkStub.listAdjustments.mockReturnValueOnce(of(mockPage));

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

    it('calls adjustmentsSdk.getAdjustment with the adjustmentId', () => {
      adjustmentsSdkStub.getAdjustment.mockReturnValueOnce(of(mockAdjustment));

      service.getAdjustmentDetail('adj-001').subscribe();

      expect(adjustmentsSdkStub.getAdjustment).toHaveBeenCalledWith('adj-001');
    });

    it('passes the adjustmentId as-is to the SDK', () => {
      adjustmentsSdkStub.getAdjustment.mockReturnValueOnce(of(mockAdjustment));

      service.getAdjustmentDetail('adj/001').subscribe();

      expect(adjustmentsSdkStub.getAdjustment).toHaveBeenCalledWith('adj/001');
    });

    it('returns the AdjustmentDetail emitted by the SDK', () => {
      adjustmentsSdkStub.getAdjustment.mockReturnValueOnce(of(mockAdjustment));

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

    it('calls adjustmentsSdk.approveAdjustment with the adjustmentId and empty body', () => {
      adjustmentsSdkStub.approveAdjustment.mockReturnValueOnce(of(mockAdjustment));

      service.approveAdjustment('adj-001').subscribe();

      expect(adjustmentsSdkStub.approveAdjustment).toHaveBeenCalledWith('adj-001', {});
    });

    it('passes the adjustmentId as-is to the SDK', () => {
      adjustmentsSdkStub.approveAdjustment.mockReturnValueOnce(of(mockAdjustment));

      service.approveAdjustment('adj/001').subscribe();

      expect(adjustmentsSdkStub.approveAdjustment).toHaveBeenCalledWith('adj/001', {});
    });
  });

  // ── rejectAdjustment() ────────────────────────────────────────────────

  describe('rejectAdjustment()', () => {
    it('calls adjustmentsSdk.rejectAdjustment with the adjustmentId and rejection reason', () => {
      adjustmentsSdkStub.rejectAdjustment.mockReturnValueOnce(of(undefined));

      service.rejectAdjustment('adj-001', 'Count error').subscribe();

      expect(adjustmentsSdkStub.rejectAdjustment).toHaveBeenCalledWith('adj-001', { rejectorUserId: '', rejectionReason: 'Count error' });
    });

    it('passes the adjustmentId as-is to the SDK', () => {
      adjustmentsSdkStub.rejectAdjustment.mockReturnValueOnce(of(undefined));

      service.rejectAdjustment('adj/001', 'reason').subscribe();

      expect(adjustmentsSdkStub.rejectAdjustment).toHaveBeenCalledWith('adj/001', { rejectorUserId: '', rejectionReason: 'reason' });
    });

    it('sends the rejection reason in the SDK payload', () => {
      adjustmentsSdkStub.rejectAdjustment.mockReturnValueOnce(of(undefined));

      service.rejectAdjustment('adj-001', 'Inaccurate count').subscribe();

      const [, body] = adjustmentsSdkStub.rejectAdjustment.mock.calls[0];
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

    it('calls plansSdk.createPlan with the request', () => {
      plansSdkStub.createPlan.mockReturnValueOnce(of(mockPlan));

      service.createCycleCountPlan(mockRequest).subscribe();

      expect(plansSdkStub.createPlan).toHaveBeenCalledWith(mockRequest);
    });

    it('returns the created CycleCountPlan emitted by the SDK', () => {
      plansSdkStub.createPlan.mockReturnValueOnce(of(mockPlan));

      let result: CycleCountPlan | undefined;
      service.createCycleCountPlan(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockPlan);
    });
  });
});
