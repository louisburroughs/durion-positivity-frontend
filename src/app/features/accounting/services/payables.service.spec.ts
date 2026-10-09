import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PageVendorBillStageRow,
  VendorBillAPIService,
  VendorBillApprovalRequiredTierEnum,
  VendorBillAvailableActionActionEnum,
  VendorBillCheckOutcomeEnum,
  VendorBillMatchConfidenceEnum,
  VendorBillResponse,
  VendorBillResponseChannelEnum,
  VendorBillResponseStatusEnum,
  VendorBillStageCounts,
  VendorBillStageRowChannelEnum,
  VendorBillStageRowRequiredTierEnum,
  VendorBillStageRowStatusEnum,
  VendorBillTaxByTypeSourceEnum,
  VendorBillTaxOnResaleOverrideSourceEnum,
  VendorBillClassificationDebitClassEnum,
  VendorBillDifferenceClassEnum,
  VendorBillPostingPostingDateRuleEnum,
  VendorApSettingsResponseDefaultDebitClassEnum,
  VendorDirectoryAPIService,
  VendorResponse,
} from '@durion-sdk/accounting';
import { NO_POSTING_INPUT } from '../models/payables.models';
import { BILL_PAGE_SIZE, PayablesService } from './payables.service';

/** A complete SDK `VendorBillResponse`, typed against the generated interface (ADR-0032). */
const response = (overrides: Partial<VendorBillResponse> = {}): VendorBillResponse => ({
  vendorBillId: 'bill-1',
  vendorId: 'vendor-1',
  vendorName: ' Northside Parts ',
  billNumber: 'INV-4471',
  billDate: '2026-10-01',
  channel: VendorBillResponseChannelEnum.SupplierConnection,
  totalAmount: 1840.5,
  netAmount: 1700,
  taxAmount: 140.5,
  openAmount: 1840.5,
  currency: 'USD',
  status: VendorBillResponseStatusEnum.AwaitingApproval,
  createdAt: '2026-10-01T09:00:00Z',
  approval: {
    requiredTier: VendorBillApprovalRequiredTierEnum.OverLimit,
    clerkLimit: 1000,
    currencyCode: 'USD',
    submittedAt: '2026-10-02T09:00:00Z',
    submittedBy: 'SYSTEM',
    proposedClassification: { debitClass: VendorBillClassificationDebitClassEnum.Expense, expenseMappingKey: 'EXPENSE_SHOP_SUPPLIES' },
    proposedDifference: { class: VendorBillDifferenceClassEnum.Freight, justification: 'Delivery charge on the invoice' },
  },
  posting: {
    journalEntryId: 'je-uuid',
    journalEntryReference: 'JE-202610-14',
    postingDate: '2026-10-03',
    postingDateRule: VendorBillPostingPostingDateRuleEnum.ApprovalDateBillPeriodNotOpen,
    grossAmount: 1840.5,
    roundingAdjustment: 0.01,
    currencyCode: 'USD',
  },
  availableActions: [
    { action: VendorBillAvailableActionActionEnum.Approve, allowed: false, blockedReason: 'AP_APPROVAL_LIMIT_EXCEEDED', justificationRequired: false },
    { action: VendorBillAvailableActionActionEnum.Reject, allowed: true, justificationRequired: true },
  ],
  checks: [{ code: 'WITHIN_CLERK_LIMIT', outcome: VendorBillCheckOutcomeEnum.Fail, args: { clerkLimit: '1000.00' } }],
  lines: [
    {
      lineNumber: 1,
      productId: 'product-uuid',
      description: 'Brake pads',
      inventoryItem: true,
      receivedQuantity: 4,
      receivedUnitPrice: 20,
      billedQuantity: 4,
      billedUnitPrice: 21,
      currencyCode: 'USD',
    },
  ],
  match: {
    evidenceId: 'evidence-uuid',
    score: 82,
    confidence: VendorBillMatchConfidenceEnum.HighConfidence,
    points: { amount: 40, products: 30, date: 10, purchaseOrder: 2 },
    invoiceReference: 'INV-4471',
    invoiceDate: '2026-10-01',
    receivedDate: '2026-09-30',
    billedTotal: 1840.5,
    receivedTotal: 1800,
    currencyCode: 'USD',
    recordedAt: '2026-10-01T09:00:00Z',
    source: 'MATCH',
    withinTolerance: true,
  },
  openCandidates: [
    { candidateId: 'cand-1', invoiceEventId: 'event-uuid', vendorBillId: 'bill-9', billNumber: 'REC-9', billTotal: 1800, currencyCode: 'USD', score: 74 },
  ],
  reissues: [],
  taxByType: [{ taxType: 'GST', amount: 140.5, source: VendorBillTaxByTypeSourceEnum.Document }],
  inputTaxRecovery: [{ taxType: 'GST', statedAmount: 140.5, recoveredAmount: 0, recoveryWithheldReason: 'NOT_REGISTERED' }],
  taxOnResaleOverride: { source: VendorBillTaxOnResaleOverrideSourceEnum.Bill, justification: 'Resold at cost to fleet' },
  ...overrides,
});

describe('PayablesService', () => {
  let service: PayablesService;
  const sdk = {
    getVendorBillStageCounts: vi.fn(),
    listVendorBillsByStage: vi.fn(),
    getVendorBillById: vi.fn(),
    submitVendorBillForApproval: vi.fn(),
    approveVendorBill: vi.fn(),
    rejectVendorBill: vi.fn(),
    resolveVendorBillMatchException: vi.fn(),
    selectVendorBillMatchCandidate: vi.fn(),
    setVendorBillDueDate: vi.fn(),
    voidVendorBill: vi.fn(),
  };
  const vendors = { getVendorById: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
        PayablesService,
        { provide: VendorBillAPIService, useValue: sdk },
        { provide: VendorDirectoryAPIService, useValue: vendors },
      ],
    });
    service = TestBed.inject(PayablesService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getStageCounts()', () => {
    it('calls getVendorBillStageCounts with no arguments and emits the served figures', async () => {
      const served: VendorBillStageCounts = { check: 3, approve: 2, pay: 4, done: 1, asOf: '2026-10-06T10:00:00Z' };
      sdk.getVendorBillStageCounts.mockReturnValue(of(served));

      const counts = await firstValueFrom(service.getStageCounts());

      expect(sdk.getVendorBillStageCounts).toHaveBeenCalledWith();
      expect(counts).toEqual({ check: 3, approve: 2, pay: 4, done: 1, asOf: '2026-10-06T10:00:00Z' });
    });
  });

  describe('listByStage()', () => {
    it('calls listVendorBillsByStage(stage, page, size) and maps each row, unknown values to UNKNOWN', async () => {
      const page: PageVendorBillStageRow = {
        content: [
          {
            vendorBillId: 'bill-1',
            billNumber: 'INV-4471',
            vendorName: 'Northside Parts',
            totalAmount: 1840.5,
            openAmount: 1840.5,
            currencyCode: 'USD',
            billDate: '2026-10-01',
            status: VendorBillStageRowStatusEnum.PendingReceiptMatch,
            channel: VendorBillStageRowChannelEnum.SupplierConnection,
            requiredTier: VendorBillStageRowRequiredTierEnum.Clerk,
            vendorApHold: false,
          },
          {
            vendorBillId: 'bill-2',
            billNumber: 'INV-5520',
            totalAmount: 90,
            openAmount: 90,
            currencyCode: 'USD',
            billDate: '2026-10-02',
            status: 'SOMETHING_NEW' as VendorBillStageRowStatusEnum,
            vendorApHold: true,
          },
        ],
        number: 1,
        size: 25,
        totalElements: 27,
        totalPages: 2,
      };
      sdk.listVendorBillsByStage.mockReturnValue(of(page));

      const result = await firstValueFrom(service.listByStage('CHECK', 1));

      expect(sdk.listVendorBillsByStage).toHaveBeenCalledWith('CHECK', 1, BILL_PAGE_SIZE);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(2);
      expect(result.items[0]).toEqual({
        billId: 'bill-1',
        billNumber: 'INV-4471',
        vendorName: 'Northside Parts',
        totalAmount: 1840.5,
        openAmount: 1840.5,
        currencyCode: 'USD',
        billDate: '2026-10-01',
        dueDate: null,
        status: 'PENDING_RECEIPT_MATCH',
        channel: 'SUPPLIER_CONNECTION',
        requiredTier: 'CLERK',
        submittedAt: null,
        vendorApHold: false,
      });
      expect(result.items[1].status).toBe('UNKNOWN');
      expect(result.items[1].channel).toBe('UNKNOWN');
      expect(result.items[1].vendorName).toBeNull();
      expect(result.items[1].requiredTier).toBeNull();
    });
  });

  describe('getBill()', () => {
    it('calls getVendorBillById(billId) and maps the review read, keeping S32d and S43 fields', async () => {
      sdk.getVendorBillById.mockReturnValue(of(response()));

      const detail = await firstValueFrom(service.getBill('bill-1'));

      expect(sdk.getVendorBillById).toHaveBeenCalledWith('bill-1');
      expect(detail.vendorName).toBe('Northside Parts');
      expect(detail.channel).toBe('SUPPLIER_CONNECTION');
      expect(detail.status).toBe('AWAITING_APPROVAL');
      expect(detail.vendorId).toBe('vendor-1');
      expect(detail.approval).toEqual({
        requiredTier: 'OVER_LIMIT',
        clerkLimit: 1000,
        currencyCode: 'USD',
        submittedAt: '2026-10-02T09:00:00Z',
        submissionJustification: null,
        approvedAt: null,
        approvalJustification: null,
        approvedAutomatically: false,
        submittedAutomatically: true,
        proposedClassification: { debitClass: 'EXPENSE', expenseMappingKey: 'EXPENSE_SHOP_SUPPLIES' },
        proposedDifference: { differenceClass: 'FREIGHT', justification: 'Delivery charge on the invoice' },
      });
      // No actor username is kept (Q4): only "Automatic" for SYSTEM.
      expect(JSON.stringify(detail)).not.toContain('clerk-uuid');
      expect(detail.posting).toEqual({
        journalEntryId: 'je-uuid',
        journalEntryReference: 'JE-202610-14',
        postingDate: '2026-10-03',
        postingDateRule: 'APPROVAL_DATE_BILL_PERIOD_NOT_OPEN',
        differenceClass: null,
        differenceAmount: null,
        roundingAdjustment: 0.01,
        reversalReference: null,
        currencyCode: 'USD',
      });
      expect(detail.availableActions).toEqual([
        { action: 'APPROVE', allowed: false, blockedReason: 'AP_APPROVAL_LIMIT_EXCEEDED', justificationRequired: false },
        { action: 'REJECT', allowed: true, blockedReason: null, justificationRequired: true },
      ]);
      expect(detail.checks).toEqual([{ code: 'WITHIN_CLERK_LIMIT', outcome: 'FAIL', args: { clerkLimit: '1000.00' } }]);
      expect(detail.match).toEqual({
        score: 82,
        confidence: 'HIGH_CONFIDENCE',
        points: { amount: 40, products: 30, date: 10, purchaseOrder: 2 },
        invoiceReference: 'INV-4471',
        invoiceDate: '2026-10-01',
        withinTolerance: true,
      });
      expect(detail.openCandidates).toEqual([
        { candidateId: 'cand-1', billNumber: 'REC-9', billTotal: 1800, currencyCode: 'USD', score: 74, points: null },
      ]);
      expect(detail.lines[0]).toEqual({
        lineNumber: 1,
        description: 'Brake pads',
        inventoryItem: true,
        receivedQuantity: 4,
        receivedUnitPrice: 20,
        billedQuantity: 4,
        billedUnitPrice: 21,
        currencyCode: 'USD',
      });
      expect(detail.taxByType).toEqual([{ taxType: 'GST', amount: 140.5, source: 'DOCUMENT' }]);
      expect(detail.inputTaxRecovery?.[0].recoveryWithheldReason).toBe('NOT_REGISTERED');
      expect(detail.taxOnResaleOverride).toEqual({ source: 'BILL', justification: 'Resold at cost to fleet' });
    });

    it('keeps inputTaxRecovery null when not served (before the posting, or a tenant without recovery: S33)', async () => {
      sdk.getVendorBillById.mockReturnValue(of(response({ inputTaxRecovery: undefined })));

      const detail = await firstValueFrom(service.getBill('bill-1'));

      expect(detail.inputTaxRecovery).toBeNull();
    });

    it('maps an action this build does not know to UNKNOWN rather than dropping it (§8.2)', async () => {
      sdk.getVendorBillById.mockReturnValue(
        of(response({ availableActions: [{ action: 'ESCALATE' as VendorBillAvailableActionActionEnum, allowed: true, justificationRequired: false }] })),
      );

      const detail = await firstValueFrom(service.getBill('bill-1'));

      expect(detail.availableActions[0].action).toBe('UNKNOWN');
    });
  });

  describe('submitForApproval()', () => {
    it('calls submitVendorBillForApproval(billId, { justification }) with no operatorId', async () => {
      sdk.submitVendorBillForApproval.mockReturnValue(of(response()));

      await firstValueFrom(service.submitForApproval('bill-1', { justification: 'Shop supplies, no delivery', posting: NO_POSTING_INPUT }));

      expect(sdk.submitVendorBillForApproval).toHaveBeenCalledWith('bill-1', { justification: 'Shop supplies, no delivery' });
    });

    it('sends a classification and difference as the proposal, never a period override (submit posts nothing)', async () => {
      sdk.submitVendorBillForApproval.mockReturnValue(of(response()));

      await firstValueFrom(
        service.submitForApproval('bill-1', {
          justification: 'Shop supplies, no delivery',
          posting: {
            classification: 'GOODS',
            difference: { differenceClass: 'FREIGHT', justification: 'Delivery on the invoice' },
            overrideJustification: 'Month closed early',
          },
        }),
      );

      expect(sdk.submitVendorBillForApproval).toHaveBeenCalledWith('bill-1', {
        justification: 'Shop supplies, no delivery',
        classification: { debitClass: 'GOODS' },
        difference: { class: 'FREIGHT', justification: 'Delivery on the invoice' },
      });
    });
  });

  describe('approve()', () => {
    it('calls approveVendorBill(billId, {}) when no reason is given — taxByType is never sent', async () => {
      sdk.approveVendorBill.mockReturnValue(of(response()));

      await firstValueFrom(service.approve('bill-1', { justification: null, taxOnResaleOverrideJustification: null, posting: NO_POSTING_INPUT }));

      expect(sdk.approveVendorBill).toHaveBeenCalledWith('bill-1', {});
    });

    it('sends the justification and the S43 override reason when given', async () => {
      sdk.approveVendorBill.mockReturnValue(of(response()));

      await firstValueFrom(
        service.approve('bill-1', {
          justification: 'Checked against PO',
          taxOnResaleOverrideJustification: 'Resold at cost to fleet',
          posting: { classification: 'GOODS', difference: null, overrideJustification: 'September closed early' },
        }),
      );

      expect(sdk.approveVendorBill).toHaveBeenCalledWith('bill-1', {
        justification: 'Checked against PO',
        taxOnResaleOverrideJustification: 'Resold at cost to fleet',
        classification: { debitClass: 'GOODS' },
        overrideJustification: 'September closed early',
      });
    });
  });

  describe('reject()', () => {
    it('calls rejectVendorBill(billId, { reason })', async () => {
      sdk.rejectVendorBill.mockReturnValue(of(response()));

      await firstValueFrom(service.reject('bill-1', 'Not our order at all'));

      expect(sdk.rejectVendorBill).toHaveBeenCalledWith('bill-1', { reason: 'Not our order at all' });
    });
  });

  describe('resolveException()', () => {
    it('calls resolveVendorBillMatchException(billId, request) with the override on ACCEPT only', async () => {
      sdk.resolveVendorBillMatchException.mockReturnValue(of(response()));

      await firstValueFrom(
        service.resolveException('bill-2', {
          resolutionAction: 'ACCEPT',
          reason: 'Price rise agreed',
          taxOnResaleOverrideJustification: 'Resold at cost',
          posting: { classification: null, difference: { differenceClass: 'PRICE_DIFFERENCE', justification: 'Price rise agreed' }, overrideJustification: null },
        }),
      );
      await firstValueFrom(
        service.resolveException('bill-2', {
          resolutionAction: 'VOID',
          reason: 'Duplicate of INV-1',
          taxOnResaleOverrideJustification: 'ignored here',
          posting: { classification: 'GOODS', difference: null, overrideJustification: 'ignored here' },
        }),
      );

      expect(sdk.resolveVendorBillMatchException).toHaveBeenNthCalledWith(1, 'bill-2', {
        resolutionAction: 'ACCEPT',
        reason: 'Price rise agreed',
        taxOnResaleOverrideJustification: 'Resold at cost',
        difference: { class: 'PRICE_DIFFERENCE', justification: 'Price rise agreed' },
      });
      expect(sdk.resolveVendorBillMatchException).toHaveBeenNthCalledWith(2, 'bill-2', {
        resolutionAction: 'VOID',
        reason: 'Duplicate of INV-1',
      });
    });
  });

  describe('selectMatchCandidate()', () => {
    it('calls selectVendorBillMatchCandidate(candidateId) with no body and answers with the chosen bill (Q5)', async () => {
      sdk.selectVendorBillMatchCandidate.mockReturnValue(of(response({ vendorBillId: 'bill-9', billNumber: 'REC-9' })));

      const chosen = await firstValueFrom(service.selectMatchCandidate('cand-1'));

      expect(sdk.selectVendorBillMatchCandidate).toHaveBeenCalledWith('cand-1');
      expect(chosen).toEqual({ billId: 'bill-9', billNumber: 'REC-9' });
    });
  });

  describe('voidBill()', () => {
    it('calls voidVendorBill(billId, { reason }) and adds the period override when given', async () => {
      sdk.voidVendorBill.mockReturnValue(of(response()));

      await firstValueFrom(service.voidBill('bill-1', { reason: 'Billed twice by mistake', overrideJustification: null }));
      await firstValueFrom(service.voidBill('bill-1', { reason: 'Billed twice by mistake', overrideJustification: 'September is closed' }));

      expect(sdk.voidVendorBill).toHaveBeenNthCalledWith(1, 'bill-1', { reason: 'Billed twice by mistake' });
      expect(sdk.voidVendorBill).toHaveBeenNthCalledWith(2, 'bill-1', {
        reason: 'Billed twice by mistake',
        overrideJustification: 'September is closed',
      });
    });
  });

  describe('getVendorDefaultClass()', () => {
    const vendor = (overrides: Partial<VendorResponse> = {}): VendorResponse => ({
      vendorId: 'vendor-1',
      vendorNumber: 'V-100',
      name: 'Northside Parts',
      status: 'ACTIVE' as VendorResponse['status'],
      apHold: false,
      paymentDetailsChanged: false,
      remitToVersion: 1,
      ...overrides,
    });

    it('calls getVendorById(vendorId) and reads apSettings.defaultDebitClass, else null', async () => {
      vendors.getVendorById.mockReturnValueOnce(
        of(
          vendor({
            apSettings: {
              defaultDebitClass: VendorApSettingsResponseDefaultDebitClassEnum.Goods,
              acceptTaxOnResaleGoods: false,
              apHold: { onHold: false },
              informationReturn: { payeeTinOnFile: false, reportable: false },
            },
          }),
        ),
      );
      vendors.getVendorById.mockReturnValueOnce(of(vendor()));

      expect(await firstValueFrom(service.getVendorDefaultClass('vendor-1'))).toBe('GOODS');
      expect(await firstValueFrom(service.getVendorDefaultClass('vendor-1'))).toBeNull();
      expect(vendors.getVendorById).toHaveBeenCalledWith('vendor-1');
    });
  });

  describe('setDueDate()', () => {
    it('calls setVendorBillDueDate(billId, { dueDate }) and adds the reason when given', async () => {
      sdk.setVendorBillDueDate.mockReturnValue(of(response()));

      await firstValueFrom(service.setDueDate('bill-1', { dueDate: '2026-11-01', justification: null }));
      await firstValueFrom(service.setDueDate('bill-1', { dueDate: '2026-11-05', justification: 'Vendor reissued terms' }));

      expect(sdk.setVendorBillDueDate).toHaveBeenNthCalledWith(1, 'bill-1', { dueDate: '2026-11-01' });
      expect(sdk.setVendorBillDueDate).toHaveBeenNthCalledWith(2, 'bill-1', {
        dueDate: '2026-11-05',
        justification: 'Vendor reissued terms',
      });
    });
  });
});
