import {
  BillAction,
  BillActionCode,
  BillChannel,
  BillCheck,
  BillDetail,
  BillStage,
  BillStatus,
  CheckOutcome,
} from '../models/payables.models';

/**
 * A translated sentence: its key and the params it interpolates, rendered as
 * text (ADR-0065). An amount param stays raw in `money`; the template formats
 * it through `| money` and merges it with {@link withParam} (ADR-0030).
 */
export interface Copy {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly money?: MoneyParam | null;
}

export interface MoneyParam {
  readonly param: string;
  readonly value: number | string;
  readonly currency: string | null;
}

export const copy = (key: string, params: Readonly<Record<string, unknown>> = {}, money: MoneyParam | null = null): Copy => ({
  key,
  params,
  money,
});

/** The params with one more entry (the formatted amount); used by templates only. */
export function withParam(
  params: Readonly<Record<string, unknown>>,
  name: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  return { ...params, [name]: value };
}

/** Badge tone: status is never colour alone, the badge always carries its text (§5.7). */
export type BadgeTone = 'neutral' | 'warning' | 'info' | 'success' | 'danger';

export const STAGE_KEYS: Readonly<Record<BillStage, { readonly label: string; readonly hint: string; readonly heading: string; readonly empty: string }>> = {
  CHECK: {
    label: 'ACCOUNTING.BILLS.STEPS.CHECK',
    hint: 'ACCOUNTING.BILLS.STEPS.CHECK_HINT',
    heading: 'ACCOUNTING.BILLS.LIST.HEADING_CHECK',
    empty: 'ACCOUNTING.BILLS.LIST.EMPTY_CHECK',
  },
  APPROVE: {
    label: 'ACCOUNTING.BILLS.STEPS.APPROVE',
    hint: 'ACCOUNTING.BILLS.STEPS.APPROVE_HINT',
    heading: 'ACCOUNTING.BILLS.LIST.HEADING_APPROVE',
    empty: 'ACCOUNTING.BILLS.LIST.EMPTY_APPROVE',
  },
  PAY: {
    label: 'ACCOUNTING.BILLS.STEPS.PAY',
    hint: 'ACCOUNTING.BILLS.STEPS.PAY_HINT',
    heading: 'ACCOUNTING.BILLS.LIST.HEADING_PAY',
    empty: 'ACCOUNTING.BILLS.LIST.EMPTY_PAY',
  },
  DONE: {
    label: 'ACCOUNTING.BILLS.STEPS.DONE',
    hint: 'ACCOUNTING.BILLS.STEPS.DONE_HINT',
    heading: 'ACCOUNTING.BILLS.LIST.HEADING_DONE',
    empty: 'ACCOUNTING.BILLS.LIST.EMPTY_DONE',
  },
};

export const CHANNEL_KEYS: Readonly<Record<BillChannel, string>> = {
  SUPPLIER_CONNECTION: 'ACCOUNTING.BILLS.CHANNEL.SUPPLIER_CONNECTION',
  GOODS_RECEIPT: 'ACCOUNTING.BILLS.CHANNEL.GOODS_RECEIPT',
  UNKNOWN: 'ACCOUNTING.BILLS.CHANNEL.UNKNOWN',
};

export const CHANNEL_ICONS: Readonly<Record<BillChannel, string>> = {
  SUPPLIER_CONNECTION: 'cable',
  GOODS_RECEIPT: 'inventory_2',
  UNKNOWN: 'help',
};

/**
 * The plain status label (§4.3). `PENDING_RECEIPT_MATCH` reads by channel: a
 * supplier-connection (EDI) bill waits on its delivery, a goods-receipt bill
 * on the vendor's invoice. `MATCH_EXCEPTION` reads "Pick a match" only when
 * candidates are served (the bill read); a list row serves none.
 */
export function statusLabelKey(status: BillStatus, channel: BillChannel, hasCandidates = false): string {
  switch (status) {
    case 'PENDING_RECEIPT_MATCH':
      if (channel === 'SUPPLIER_CONNECTION') return 'ACCOUNTING.BILLS.STATUS.WAITING_DELIVERY';
      if (channel === 'GOODS_RECEIPT') return 'ACCOUNTING.BILLS.STATUS.WAITING_INVOICE';
      return 'ACCOUNTING.BILLS.STATUS.UNKNOWN';
    case 'MATCH_EXCEPTION':
      return hasCandidates ? 'ACCOUNTING.BILLS.STATUS.PICK_MATCH' : 'ACCOUNTING.BILLS.STATUS.NO_MATCH';
    case 'CURRENCY_HOLD':
      return 'ACCOUNTING.BILLS.STATUS.CURRENCY_HOLD';
    case 'AWAITING_APPROVAL':
      return 'ACCOUNTING.BILLS.STATUS.AWAITING_APPROVAL';
    case 'APPROVED':
      return 'ACCOUNTING.BILLS.STATUS.APPROVED';
    case 'REJECTED':
      return 'ACCOUNTING.BILLS.STATUS.REJECTED';
    case 'PAID':
      return 'ACCOUNTING.BILLS.STATUS.PAID';
    case 'VOIDED':
      return 'ACCOUNTING.BILLS.STATUS.VOIDED';
    default:
      return 'ACCOUNTING.BILLS.STATUS.UNKNOWN';
  }
}

/** The accountant's term, shown in grey with Show accounting terms on (P1); null for an unknown status. */
export function statusTermKey(status: BillStatus): string | null {
  const terms: Partial<Record<BillStatus, string>> = {
    PENDING_RECEIPT_MATCH: 'ACCOUNTING.BILLS.TERM.PENDING_RECEIPT_MATCH',
    MATCH_EXCEPTION: 'ACCOUNTING.BILLS.TERM.MATCH_EXCEPTION',
    CURRENCY_HOLD: 'ACCOUNTING.BILLS.TERM.CURRENCY_HOLD',
    AWAITING_APPROVAL: 'ACCOUNTING.BILLS.TERM.AWAITING_APPROVAL',
    APPROVED: 'ACCOUNTING.BILLS.TERM.APPROVED',
    REJECTED: 'ACCOUNTING.BILLS.TERM.REJECTED',
    PAID: 'ACCOUNTING.BILLS.TERM.PAID',
    VOIDED: 'ACCOUNTING.BILLS.TERM.VOIDED',
  };
  return terms[status] ?? null;
}

export function statusTone(status: BillStatus): BadgeTone {
  switch (status) {
    case 'MATCH_EXCEPTION':
    case 'CURRENCY_HOLD':
      return 'warning';
    case 'AWAITING_APPROVAL':
    case 'PENDING_RECEIPT_MATCH':
      return 'info';
    case 'APPROVED':
    case 'PAID':
      return 'success';
    case 'REJECTED':
    case 'VOIDED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export const OUTCOME_KEYS: Readonly<Record<CheckOutcome, string>> = {
  PASS: 'ACCOUNTING.BILLS.CHECKS.OUTCOME.PASS',
  FAIL: 'ACCOUNTING.BILLS.CHECKS.OUTCOME.FAIL',
  NOT_APPLICABLE: 'ACCOUNTING.BILLS.CHECKS.OUTCOME.NOT_APPLICABLE',
  UNKNOWN: 'ACCOUNTING.BILLS.CHECKS.OUTCOME.UNKNOWN',
};

export const OUTCOME_ICONS: Readonly<Record<CheckOutcome, string>> = {
  PASS: 'check_circle',
  FAIL: 'error',
  NOT_APPLICABLE: 'do_not_disturb_on',
  UNKNOWN: 'help',
};

/**
 * The served `checks[]` by code (§5.2 item 4; S12, S13, S43). S24 and S25
 * codes, once served, render through the same map; any other code reads
 * "Unknown check" (§8.2).
 */
export function checkView(check: BillCheck, currency: string | null): Copy {
  const a = check.args;
  const o = check.outcome;
  switch (check.code) {
    case 'MATCHED_TO_DELIVERY':
      if (o === 'PASS') {
        return plain(a['confidence'] === 'MEDIUM_CONFIDENCE'
          ? 'ACCOUNTING.BILLS.CHECK.MATCHED_TO_DELIVERY.PASS_MEDIUM'
          : 'ACCOUNTING.BILLS.CHECK.MATCHED_TO_DELIVERY.PASS');
      }
      if (o === 'FAIL') {
        const reasons: Readonly<Record<string, string>> = {
          PICK_A_MATCH: 'ACCOUNTING.BILLS.CHECK.MATCHED_TO_DELIVERY.FAIL_PICK_A_MATCH',
          INVOICE_NOT_MATCHED: 'ACCOUNTING.BILLS.CHECK.MATCHED_TO_DELIVERY.FAIL_INVOICE_NOT_MATCHED',
          NO_DELIVERY_RECORDED: 'ACCOUNTING.BILLS.CHECK.MATCHED_TO_DELIVERY.FAIL_NO_DELIVERY_RECORDED',
        };
        return plain(reasons[a['reason'] ?? ''] ?? 'ACCOUNTING.BILLS.CHECK.MATCHED_TO_DELIVERY.FAIL');
      }
      return plain('ACCOUNTING.BILLS.CHECK.MATCHED_TO_DELIVERY.NOT_APPLICABLE');
    case 'WITHIN_PRICE_TOLERANCE':
      return plain(byOutcome(o, 'ACCOUNTING.BILLS.CHECK.WITHIN_PRICE_TOLERANCE'));
    case 'TOTALS_ADD_UP':
      if (o === 'FAIL') {
        return withMoney('ACCOUNTING.BILLS.CHECK.TOTALS_ADD_UP.FAIL', 'difference', a['difference'], currency);
      }
      return plain(byOutcome(o, 'ACCOUNTING.BILLS.CHECK.TOTALS_ADD_UP'));
    case 'WITHIN_CLERK_LIMIT':
      if (o === 'PASS' || o === 'FAIL') {
        return withMoney(
          o === 'PASS' ? 'ACCOUNTING.BILLS.CHECK.WITHIN_CLERK_LIMIT.PASS' : 'ACCOUNTING.BILLS.CHECK.WITHIN_CLERK_LIMIT.FAIL',
          'limit',
          a['clerkLimit'],
          a['currencyCode'] ?? currency,
        );
      }
      return plain('ACCOUNTING.BILLS.CHECK.WITHIN_CLERK_LIMIT.NOT_APPLICABLE');
    case 'OPEN_DELIVERIES_FROM_VENDOR':
      if (o === 'FAIL') {
        return plain('ACCOUNTING.BILLS.CHECK.OPEN_DELIVERIES_FROM_VENDOR.FAIL', {
          count: a['count'] ?? '',
          bills: a['billNumbers'] ?? '',
        });
      }
      return plain(byOutcome(o, 'ACCOUNTING.BILLS.CHECK.OPEN_DELIVERIES_FROM_VENDOR'));
    case 'VENDOR_AP_HOLD':
      if (o === 'FAIL') {
        return plain('ACCOUNTING.BILLS.CHECK.VENDOR_AP_HOLD.FAIL', { reason: a['reason'] ?? '' });
      }
      return plain(byOutcome(o, 'ACCOUNTING.BILLS.CHECK.VENDOR_AP_HOLD'));
    case 'TAX_ON_RESALE_GOODS':
      if (o === 'FAIL') {
        return withMoney('ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.FAIL', 'tax', a['taxAmount'], a['currencyCode'] ?? currency);
      }
      if (o === 'PASS') {
        return plain(a['acceptedBy'] === 'BILL'
          ? 'ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.PASS_BILL'
          : 'ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.PASS_VENDOR_SETTING');
      }
      return plain(a['rulesUnavailable'] === 'true'
        ? 'ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.RULES_UNAVAILABLE'
        : 'ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.NOT_APPLICABLE');
    default:
      return plain('ACCOUNTING.BILLS.CHECK.UNKNOWN');
  }
}

function plain(key: string, params: Readonly<Record<string, unknown>> = {}): Copy {
  return copy(key, params);
}

function withMoney(key: string, param: string, value: string | undefined, currency: string | null): Copy {
  return copy(key, { [param]: '' }, value ? { param, value, currency } : null);
}

function byOutcome(outcome: CheckOutcome, prefix: string): string {
  if (outcome === 'PASS') return `${prefix}.PASS`;
  if (outcome === 'FAIL') return `${prefix}.FAIL`;
  return `${prefix}.NOT_APPLICABLE`;
}

/** The served action, if listed. */
export function findAction(bill: BillDetail | null, code: BillActionCode): BillAction | null {
  return bill?.availableActions.find(action => action.action === code) ?? null;
}

/** Why a listed action is blocked, as copy; the limit is served on the bill (`approval.clerkLimit`). */
export const BLOCKED_KEYS: Readonly<Record<string, string>> = {
  AP_APPROVAL_LIMIT_EXCEEDED: 'ACCOUNTING.BILLS.DECISION.BLOCKED.AP_APPROVAL_LIMIT_EXCEEDED',
  AP_BILL_SELF_APPROVAL: 'ACCOUNTING.BILLS.DECISION.BLOCKED.AP_BILL_SELF_APPROVAL',
};

export function blockedReasonKey(reason: string | null): string {
  return (reason && BLOCKED_KEYS[reason]) || 'ACCOUNTING.BILLS.DECISION.BLOCKED.UNKNOWN';
}

/**
 * §5.1 / story item 6: a clerk choosing Accept as billed above their limit is
 * offered **Resolve and send for approval** instead — `ACCEPT_EXCEPTION`
 * served blocked by `AP_APPROVAL_LIMIT_EXCEEDED` while `SUBMIT_FOR_APPROVAL`
 * is allowed. The decision block then does not repeat Send for approval.
 */
export function offersResolveAndSend(bill: BillDetail | null): boolean {
  const accept = findAction(bill, 'ACCEPT_EXCEPTION');
  const submit = findAction(bill, 'SUBMIT_FOR_APPROVAL');
  return !!accept && !accept.allowed && accept.blockedReason === 'AP_APPROVAL_LIMIT_EXCEEDED' && !!submit?.allowed;
}

/** The S43 hold applies to this bill: `TAX_ON_RESALE_GOODS` served FAIL. */
export function taxOnResaleHeld(bill: BillDetail | null): boolean {
  return !!bill?.checks.some(check => check.code === 'TAX_ON_RESALE_GOODS' && check.outcome === 'FAIL');
}

/**
 * A blocked action's reason as copy (P5): the limit note names the served
 * clerk limit; the creator rule its sentence; anything else a general one.
 */
export function blockedCopy(action: BillAction, bill: BillDetail): Copy {
  if (action.blockedReason === 'AP_APPROVAL_LIMIT_EXCEEDED') {
    if (!bill.approval) return copy('ACCOUNTING.BILLS.DECISION.BLOCKED.AP_APPROVAL_LIMIT_EXCEEDED_NO_LIMIT');
    return copy(BLOCKED_KEYS['AP_APPROVAL_LIMIT_EXCEEDED'], { limit: '' }, {
      param: 'limit',
      value: bill.approval.clerkLimit,
      currency: bill.approval.currencyCode ?? bill.currency,
    });
  }
  return copy(blockedReasonKey(action.blockedReason));
}

/** A reason of {@link BILL_REASON_MIN}–{@link BILL_REASON_MAX} characters once trimmed. */
export function reasonValid(value: string, min: number, max: number): boolean {
  const length = value.trim().length;
  return length >= min && length <= max;
}

/** The decisions that carry the posting choices: Send, Approve and Accept as billed (Q1). */
const POSTING_DECISIONS: readonly BillActionCode[] = ['SUBMIT_FOR_APPROVAL', 'APPROVE', 'ACCEPT_EXCEPTION'];

/** The bill serves one of the decisions that carry a classification or a difference. */
export function postingDecisionServed(bill: BillDetail | null): boolean {
  return !!bill && POSTING_DECISIONS.some(code => !!findAction(bill, code));
}

/**
 * "What is this bill for?" shows beside Send, Approve and Accept when the bill
 * serves no lines (an EDI bill with header totals only), and is revealed when
 * a decision answered 422 `AP_BILL_UNCLASSIFIED` (Q1 A).
 */
export function classificationShown(bill: BillDetail | null, lastFailureCode: string | null): boolean {
  if (!postingDecisionServed(bill)) return false;
  return bill!.lines.length === 0 || lastFailureCode === 'AP_BILL_UNCLASSIFIED';
}

/** Where a pre-filled class comes from, in the server's order: the proposal, then the vendor's default. */
export interface ClassificationPrefill {
  readonly source: 'PROPOSAL' | 'VENDOR';
  readonly debitClass: 'GOODS' | 'EXPENSE';
}

export function classificationPrefill(bill: BillDetail | null, vendorDefault: 'GOODS' | 'EXPENSE' | null): ClassificationPrefill | null {
  const proposed = bill?.approval?.proposedClassification?.debitClass;
  if (proposed === 'GOODS' || proposed === 'EXPENSE') return { source: 'PROPOSAL', debitClass: proposed };
  if (vendorDefault) return { source: 'VENDOR', debitClass: vendorDefault };
  return null;
}

/** The served `TOTALS_ADD_UP` FAIL, whose args are quoted (never computed), or null (Q1 B). */
export function unreconciledTotals(bill: BillDetail | null): BillCheck | null {
  return bill?.checks.find(check => check.code === 'TOTALS_ADD_UP' && check.outcome === 'FAIL') ?? null;
}
