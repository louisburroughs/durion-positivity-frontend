import { describe, expect, it } from 'vitest';
import enUS from '../../../../assets/i18n/en-US.json';
import { BillCheck, BillStatus } from '../models/payables.models';
import { action, bill, check, exceptionBill } from '../pages/bills/bills-page.spec-helper';
import {
  BLOCKED_KEYS,
  CHANNEL_KEYS,
  OUTCOME_KEYS,
  STAGE_KEYS,
  blockedCopy,
  checkView,
  offersResolveAndSend,
  statusLabelKey,
  statusTermKey,
  statusTone,
  taxOnResaleHeld,
  withParam,
} from './bill-display';

/** Resolves a dotted key in the real en-US bundle (ADR-0035 §8). */
function en(key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enUS);
  return typeof value === 'string' ? value : undefined;
}

const STATUSES: BillStatus[] = [
  'PENDING_RECEIPT_MATCH',
  'MATCH_EXCEPTION',
  'CURRENCY_HOLD',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'PAID',
  'VOIDED',
  'UNKNOWN',
];

describe('bill-display', () => {
  describe('statusLabelKey (§4.3 plain labels)', () => {
    it('reads PENDING_RECEIPT_MATCH by channel', () => {
      expect(en(statusLabelKey('PENDING_RECEIPT_MATCH', 'SUPPLIER_CONNECTION'))).toBe('Waiting on delivery');
      expect(en(statusLabelKey('PENDING_RECEIPT_MATCH', 'GOODS_RECEIPT'))).toBe('Waiting on the invoice');
      expect(en(statusLabelKey('PENDING_RECEIPT_MATCH', 'UNKNOWN'))).toBe('Unknown');
    });

    it('reads MATCH_EXCEPTION as "Pick a match" only when candidates are served', () => {
      expect(en(statusLabelKey('MATCH_EXCEPTION', 'GOODS_RECEIPT'))).toBe("Doesn't match delivery");
      expect(en(statusLabelKey('MATCH_EXCEPTION', 'GOODS_RECEIPT', true))).toBe('Pick a match');
    });

    it('names the other statuses plainly and an unknown one "Unknown"', () => {
      expect(en(statusLabelKey('CURRENCY_HOLD', 'GOODS_RECEIPT'))).toBe('On hold: foreign currency');
      expect(en(statusLabelKey('AWAITING_APPROVAL', 'GOODS_RECEIPT'))).toBe('Sent for approval');
      expect(en(statusLabelKey('APPROVED', 'GOODS_RECEIPT'))).toBe('Approved · to pay');
      expect(en(statusLabelKey('UNKNOWN', 'GOODS_RECEIPT'))).toBe('Unknown');
    });

    it('gives every known status an accountant’s term and a tone; none for UNKNOWN', () => {
      for (const status of STATUSES.filter(value => value !== 'UNKNOWN')) {
        expect(en(statusTermKey(status) ?? ''), status).toBeTruthy();
      }
      expect(statusTermKey('UNKNOWN')).toBeNull();
      expect(statusTone('UNKNOWN')).toBe('neutral');
      expect(statusTone('MATCH_EXCEPTION')).toBe('warning');
    });
  });

  describe('checkView (served checks by code)', () => {
    const sentence = (served: BillCheck): string | undefined => en(checkView(served, 'USD').key);

    it('renders the S12/S13 codes through the map', () => {
      expect(sentence(check('MATCHED_TO_DELIVERY', 'PASS'))).toBe('Matches the delivery.');
      expect(sentence(check('MATCHED_TO_DELIVERY', 'FAIL', { reason: 'PICK_A_MATCH' }))).toContain('pick one');
      expect(sentence(check('WITHIN_PRICE_TOLERANCE', 'PASS'))).toContain('within tolerance');
      expect(sentence(check('OPEN_DELIVERIES_FROM_VENDOR', 'FAIL', { count: '2', billNumbers: 'REC-1, REC-2' }))).toContain('{{count}}');
    });

    it('carries the clerk limit as a money param for the template to format', () => {
      const view = checkView(check('WITHIN_CLERK_LIMIT', 'FAIL', { clerkLimit: '1000.00', currencyCode: 'CAD' }), 'USD');
      expect(en(view.key)).toBe('Over the {{limit}} clerk limit.');
      expect(view.money).toEqual({ param: 'limit', value: '1000.00', currency: 'CAD' });
    });

    it('reads S43 TAX_ON_RESALE_GOODS in all three outcomes, rulesUnavailable included', () => {
      const fail = checkView(check('TAX_ON_RESALE_GOODS', 'FAIL', { taxAmount: '12.40', currencyCode: 'USD' }), 'USD');
      expect(en(fail.key)).toContain('tax on goods you resell');
      expect(fail.money).toEqual({ param: 'tax', value: '12.40', currency: 'USD' });
      expect(sentence(check('TAX_ON_RESALE_GOODS', 'PASS', { acceptedBy: 'VENDOR_SETTING' }))).toContain('vendor’s setting');
      expect(sentence(check('TAX_ON_RESALE_GOODS', 'PASS', { acceptedBy: 'BILL' }))).toContain('for this bill');
      expect(sentence(check('TAX_ON_RESALE_GOODS', 'NOT_APPLICABLE', { rulesUnavailable: 'true' }))).toContain('couldn’t be read');
    });

    it('reads any other code as "Unknown check"', () => {
      expect(sentence(check('REMIT_TO_UNCHANGED', 'PASS'))).toBe('Unknown check.');
    });

    it('resolves every outcome of every mapped code to a real en-US key', () => {
      const codes = ['MATCHED_TO_DELIVERY', 'WITHIN_PRICE_TOLERANCE', 'TOTALS_ADD_UP', 'WITHIN_CLERK_LIMIT', 'OPEN_DELIVERIES_FROM_VENDOR', 'VENDOR_AP_HOLD', 'TAX_ON_RESALE_GOODS'];
      for (const code of codes) {
        for (const outcome of ['PASS', 'FAIL', 'NOT_APPLICABLE', 'UNKNOWN'] as const) {
          const key = checkView(check(code, outcome, { reason: 'INVOICE_NOT_MATCHED', confidence: 'MEDIUM_CONFIDENCE' }), 'USD').key;
          expect(en(key), `${code}/${outcome} → ${key}`).toBeTruthy();
        }
      }
    });
  });

  describe('decision helpers', () => {
    it('offers Resolve and send only when ACCEPT is blocked by the clerk limit and SUBMIT is allowed (§5.1)', () => {
      const blocked = exceptionBill({
        availableActions: [
          action('ACCEPT_EXCEPTION', { allowed: false, blockedReason: 'AP_APPROVAL_LIMIT_EXCEEDED' }),
          action('SUBMIT_FOR_APPROVAL'),
        ],
      });
      expect(offersResolveAndSend(blocked)).toBe(true);
      expect(offersResolveAndSend(exceptionBill())).toBe(false);
      expect(
        offersResolveAndSend(
          exceptionBill({ availableActions: [action('ACCEPT_EXCEPTION', { allowed: false, blockedReason: 'AP_BILL_SELF_APPROVAL' }), action('SUBMIT_FOR_APPROVAL')] }),
        ),
      ).toBe(false);
    });

    it('names the served limit in a limit block and the creator rule otherwise', () => {
      const limit = blockedCopy(action('APPROVE', { allowed: false, blockedReason: 'AP_APPROVAL_LIMIT_EXCEEDED' }), bill());
      expect(en(limit.key)).toBe('Over the {{limit}} clerk limit: a controller or general manager approves.');
      expect(limit.money).toEqual({ param: 'limit', value: 2500, currency: 'USD' });
      const self = blockedCopy(action('APPROVE', { allowed: false, blockedReason: 'AP_BILL_SELF_APPROVAL' }), bill());
      expect(en(self.key)).toBe('You can’t approve a bill you created.');
      expect(en(blockedCopy(action('APPROVE', { allowed: false, blockedReason: 'LATER_RULE' }), bill()).key)).toBeTruthy();
      expect(en(blockedCopy(action('APPROVE', { allowed: false, blockedReason: 'AP_APPROVAL_LIMIT_EXCEEDED' }), bill({ approval: null })).key)).toBeTruthy();
    });

    it('sees the S43 hold only on a served TAX_ON_RESALE_GOODS FAIL', () => {
      expect(taxOnResaleHeld(bill({ checks: [check('TAX_ON_RESALE_GOODS', 'FAIL')] }))).toBe(true);
      expect(taxOnResaleHeld(bill({ checks: [check('TAX_ON_RESALE_GOODS', 'PASS', { acceptedBy: 'BILL' })] }))).toBe(false);
      expect(taxOnResaleHeld(null)).toBe(false);
    });

    it('withParam adds one param without touching the original', () => {
      const params = { a: 1 };
      expect(withParam(params, 'b', 2)).toEqual({ a: 1, b: 2 });
      expect(params).toEqual({ a: 1 });
    });
  });

  it('every static key the maps hold exists in en-US (ADR-0030)', () => {
    const keys = [
      ...Object.values(STAGE_KEYS).flatMap(entry => Object.values(entry)),
      ...Object.values(CHANNEL_KEYS),
      ...Object.values(OUTCOME_KEYS),
      ...Object.values(BLOCKED_KEYS),
      ...STATUSES.flatMap(status => [statusLabelKey(status, 'SUPPLIER_CONNECTION'), statusLabelKey(status, 'GOODS_RECEIPT', true)]),
    ];
    for (const key of keys) expect(en(key), key).toBeTruthy();
  });
});
