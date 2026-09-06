/**
 * Domain shapes for the Payables (vendor-bills) surface (#214).
 *
 * Mirrors `@durion-sdk/accounting`'s vendor-bill types, kept separate from
 * the generated SDK types per this repo's convention. Named `Payable*`
 * rather than `VendorBill*` so this never collides with the unrelated
 * `VendorBill` model `accounting.models.ts` already uses for the AP
 * payment-selection surface (`APPaymentsService.listApBills`, a different
 * SDK operation and a different bill population).
 *
 * By decision (#1637/#1638 owner comments), there is no raw-invoice read on
 * pos-supplier — Payables reads end to end through pos-accounting's
 * vendor-bills API.
 */

export type PayableBillStatus =
  | 'PENDING_RECEIPT_MATCH'
  | 'MATCH_EXCEPTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID'
  | 'VOIDED';

/** One row of the Payables list/exceptions view. */
export interface PayableBillListRow {
  readonly billId: string;
  readonly vendorId: string;
  readonly amount: number;
  readonly dueDate: string | null;
  readonly status: PayableBillStatus;
}

export interface PayableBillListPage {
  readonly items: readonly PayableBillListRow[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

/** Full vendor-bill detail. */
export interface PayableBillDetail {
  readonly billId: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly billNumber: string;
  readonly billDate: string | null;
  readonly dueDate: string | null;
  readonly totalAmount: number;
  readonly status: PayableBillStatus;
  readonly approvalJustification: string | null;
  readonly rejectionReason: string | null;
  readonly journalEntryId: string | null;
  readonly paymentTransactionId: string | null;
  readonly originEventId: string | null;
  readonly originEventType: string | null;
  readonly createdAt: string;
  readonly createdBy: string | null;
}

export type ExceptionResolutionAction = 'ACCEPT' | 'VOID' | 'CORRECT';

export interface ExceptionResolution {
  readonly resolutionAction: ExceptionResolutionAction;
  readonly reason: string;
}

/** One scored, unresolved candidate bill for an ambiguous invoice match. */
export interface PayableMatchCandidate {
  readonly candidateId: string;
  readonly invoiceEventId: string;
  readonly vendorBillId: string;
  readonly vendorId: string | null;
  readonly billNumber: string | null;
  readonly billTotalAmount: number | null;
  readonly matchScore: number | null;
  readonly scoreBreakdown: string | null;
  readonly resolved: boolean;
  readonly selected: boolean;
  readonly createdAt: string | null;
}
