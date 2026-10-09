import { describe, expect, it } from 'vitest';
import enUS from '../../../../../assets/i18n/en-US.json';
import esMX from '../../../../../assets/i18n/es-MX.json';
import esUS from '../../../../../assets/i18n/es-US.json';
import frCA from '../../../../../assets/i18n/fr-CA.json';
import frFR from '../../../../../assets/i18n/fr-FR.json';

/**
 * Copy claims of the story, asserted against the real bundles (ADR-0035 §8),
 * and the S43 keys this story owns in en, fr-CA and es (backend PR #2665).
 */
const BUNDLES = { 'en-US': enUS, 'fr-CA': frCA, 'fr-FR': frFR, 'es-US': esUS, 'es-MX': esMX } as const;

function at(bundle: unknown, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
  return typeof value === 'string' ? value : undefined;
}

describe('Bills to pay and Approval limits copy (en-US)', () => {
  it.each([
    ['ACCOUNTING.BILLS.TITLE', 'Bills to pay'],
    ['ACCOUNTING.BILLS.STATUS.WAITING_DELIVERY', 'Waiting on delivery'],
    ['ACCOUNTING.BILLS.STATUS.WAITING_INVOICE', 'Waiting on the invoice'],
    ['ACCOUNTING.BILLS.STATUS.NO_MATCH', "Doesn't match delivery"],
    ['ACCOUNTING.BILLS.STATUS.PICK_MATCH', 'Pick a match'],
    ['ACCOUNTING.BILLS.STATUS.CURRENCY_HOLD', 'On hold: foreign currency'],
    ['ACCOUNTING.BILLS.STATUS.AWAITING_APPROVAL', 'Sent for approval'],
    ['ACCOUNTING.BILLS.STATUS.APPROVED', 'Approved · to pay'],
    ['ACCOUNTING.BILLS.LIST.EMPTY_CHECK', 'No bills need your review'],
    ['ACCOUNTING.BILLS.LINES.NONE', 'This bill came without line detail'],
    ['ACCOUNTING.BILLS.MATCH.STRONG', '70 or more is strong'],
    ['ACCOUNTING.BILLS.MATCH.NONE', 'Not matched to a delivery'],
    ['ACCOUNTING.BILLS.MATCH.HELP.SUMMARY', 'What’s a match score?'],
    ['ACCOUNTING.BILLS.ROUTING.OVER_LIMIT', 'Over the {{limit}} clerk limit: a controller or general manager approves.'],
    ['ACCOUNTING.BILLS.ROUTING.HELP.SUMMARY', 'Why can’t I approve my own bill?'],
    ['ACCOUNTING.BILLS.DECISION.SEND', 'Send for approval'],
    ['ACCOUNTING.BILLS.DECISION.SEND_NOTE_LABEL', 'What was this for?'],
    ['ACCOUNTING.BILLS.DECISION.SEND_CONSEQUENCE', 'It goes to someone who can approve this amount.'],
    ['ACCOUNTING.BILLS.DECISION.APPROVE', 'Approve bill'],
    ['ACCOUNTING.BILLS.DECISION.APPROVE_CONSEQUENCE', 'Approving puts {{amount}} owed to {{vendor}} on the books. Approved bills can’t be edited; a mistake is fixed with a credit note. Someone else pays it.'],
    ['ACCOUNTING.BILLS.POSTING.CLASSIFICATION.LEGEND', 'What is this bill for?'],
    ['ACCOUNTING.BILLS.POSTING.CLASSIFICATION.GOODS', 'Stock for the shelves'],
    ['ACCOUNTING.BILLS.POSTING.CLASSIFICATION.FROM_PROPOSAL', 'From the clerk’s proposal'],
    ['ACCOUNTING.BILLS.POSTING.CLASSIFICATION.FROM_VENDOR', 'This vendor’s default'],
    ['ACCOUNTING.BILLS.POSTING.CLASSIFICATION.EXPENSE_LATER', 'If this bill is for stock, choose Stock for the shelves. Expense categories can’t be chosen on this page yet, so an expense bill stays in Approve for now.'],
    ['ACCOUNTING.BILLS.POSTING.DIFFERENCE.FIGURES', 'Net {{net}} + tax {{tax}} doesn’t equal the total {{total}}. Difference: {{difference}}.'],
    ['ACCOUNTING.BILLS.POSTING.DIFFERENCE.WHERE', 'Where does the difference go?'],
    ['ACCOUNTING.BILLS.POSTING.OVERRIDE_LABEL', 'Override reason'],
    ['ACCOUNTING.BILLS.DECISION.VOID_APPROVED_CONSEQUENCE', 'Voiding takes this bill off the books today. Only bills with nothing paid can be voided.'],
    ['ACCOUNTING.BILLS.DECISION.VOID_UNMATCHED_CONSEQUENCE', 'Voiding removes this placeholder. Nothing was posted, so nothing is reversed.'],
    ['ACCOUNTING.BILLS.ERROR.NOT_VOIDABLE', 'Part of this bill is paid; ask the vendor for a credit note.'],
    ['ACCOUNTING.BILLS.ERROR.LOCK_TIMEOUT', 'Someone else is working on this bill right now. Try again.'],
    ['ACCOUNTING.BILLS.ERROR.ZERO_TOTAL', 'A bill of 0.00 can’t be approved.'],
    ['ACCOUNTING.BILLS.ERROR.AWAITING_INVOICE', 'This delivery is still waiting for the vendor’s invoice.'],
    ['ACCOUNTING.BILLS.PANEL.ON_THE_BOOKS', 'On the books: {{reference}} on {{date}}'],
    ['ACCOUNTING.BILLS.PANEL.MONTH_WAS_CLOSED', '(the bill’s month was closed)'],
    ['ACCOUNTING.BILLS.DONE.MATCHED_OTHER', 'Bill {{number}} is matched to the vendor’s invoice and now waits for approval.'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.NOTE', 'Your administrator decides which roles hold each permission.'],
    ['ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.VENDOR_INACTIVE', 'This vendor is inactive, so its bills can’t be paid.'],
    ['ACCOUNTING.VENDOR_PAYMENT_NEW.REFUSAL.PAY_FROM', 'This shop has more than one account to pay from. Choosing one on this page isn’t available yet, so this payment can’t be made here.'],
    ['ACCOUNTING.BILLS.DECISION.REJECT', 'Reject bill'],
    ['ACCOUNTING.BILLS.DECISION.REJECT_CONSEQUENCE', 'Rejecting can’t be undone.'],
    ['ACCOUNTING.BILLS.DECISION.BLOCKED.AP_BILL_SELF_APPROVAL', 'You can’t approve a bill you created.'],
    ['ACCOUNTING.BILLS.DECISION.RESALE_LABEL', 'Why accept tax on goods for resale?'],
    ['ACCOUNTING.BILLS.EXCEPTION.ACCEPT', 'Accept as billed'],
    ['ACCOUNTING.BILLS.EXCEPTION.CORRECT', 'Correct the bill'],
    ['ACCOUNTING.BILLS.EXCEPTION.VOID', 'Void the bill'],
    ['ACCOUNTING.BILLS.EXCEPTION.WHY', 'Why?'],
    ['ACCOUNTING.BILLS.EXCEPTION.RESOLVE', 'Resolve bill'],
    ['ACCOUNTING.BILLS.EXCEPTION.RESOLVE_AND_SEND', 'Resolve and send for approval'],
    ['ACCOUNTING.BILLS.CANDIDATES.NOTE', 'Matching only — it still needs approval'],
    ['ACCOUNTING.BILLS.DUE_DATE.ADD', 'Add the vendor’s due date'],
    ['ACCOUNTING.BILLS.PANEL.NO_DUE_DATE', 'No due date yet'],
    ['ACCOUNTING.BILLS.PAY.REVIEW_AND_PAY', 'Review and pay'],
    ['ACCOUNTING.BILLS.PAY.NOTE', 'You can’t pay a bill you approved.'],
    ['ACCOUNTING.BILLS.ERROR.CHANGED', 'This bill changed — showing its current state.'],
    ['ACCOUNTING.BILLS.ERROR.NOT_FOUND', 'This bill no longer exists.'],
    ['ACCOUNTING.VENDOR_PAYMENT_NEW.SELF_APPROVED', 'You approved {{bills}}; someone else must pay them.'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.CLERK_LABEL', 'Clerk approval limit'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.AUTO_LABEL', 'Automatic approval limit'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.ERROR.AUTO_ABOVE_CLERK', 'Can’t be more than the clerk limit'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.MEANS.CLERK', 'Bills up to {{clerk}} (including tax): a clerk can approve them. Above that: a controller or general manager approves.'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.MEANS.NO_CLERK', 'Every bill needs a controller or general manager'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.MEANS.AUTO', 'Strong matches up to {{auto}} are approved automatically'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.MEANS.NO_AUTO', 'Nothing is approved automatically'],
    ['ACCOUNTING.APPROVAL_LIMITS.BILLS.WHO.SUMMARY', 'Who can do what'],
    ['ACCOUNTING.APPROVAL_LIMITS.SAVE.HEADING', 'Save your changes'],
    ['ACCOUNTING.APPROVAL_LIMITS.SAVE.REASON_LABEL', 'Why are you changing this?'],
    ['ACCOUNTING.APPROVAL_LIMITS.SAVE.CONSEQUENCE', 'New limits apply from now on. Bills already approved and drawer payments already recorded don’t change.'],
    ['ACCOUNTING.APPROVAL_LIMITS.SAVE.UNDO', 'Undo changes'],
  ])('%s reads "%s"', (key, text) => {
    expect(at(enUS, key)).toBe(text);
  });

  it('removes the unused ACCOUNTING.PAYABLES keys from every bundle', () => {
    for (const [locale, bundle] of Object.entries(BUNDLES)) {
      expect(at(bundle, 'ACCOUNTING.PAYABLES.LIST.TITLE'), locale).toBeUndefined();
      expect((bundle as { ACCOUNTING: Record<string, unknown> }).ACCOUNTING['PAYABLES'], locale).toBeUndefined();
    }
  });

  it('carries the S43 copy (tax on goods for resale and the tax-quote refusals) in every bundle', () => {
    const keys = [
      'ACCOUNTING.BILLS.DECISION.RESALE_LABEL',
      'ACCOUNTING.BILLS.DECISION.RESALE_HINT',
      'ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.FAIL',
      'ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.PASS_VENDOR_SETTING',
      'ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.PASS_BILL',
      'ACCOUNTING.BILLS.CHECK.TAX_ON_RESALE_GOODS.RULES_UNAVAILABLE',
      'ACCOUNTING.BILLS.PANEL.RESALE_OVERRIDE_BILL',
      'ACCOUNTING.BILLS.ERROR.TAX_ON_RESALE_GOODS',
      'ACCOUNTING.BILLS.ERROR.OVERRIDE_TOO_LONG',
      'ACCOUNTING.BILLS.ERROR.TAX_JURISDICTION_NOT_CONFIGURED',
      'ACCOUNTING.BILLS.ERROR.CURRENCY_NOT_SUPPORTED',
      'ACCOUNTING.BILLS.ERROR.TAX_CAPABILITY_UNSUPPORTED',
      'ACCOUNTING.BILLS.ERROR.SERVICE_UNAVAILABLE',
      'ACCOUNTING.BILLS.ERROR.SERVICE_UNAVAILABLE_AFTER',
    ];
    for (const [locale, bundle] of Object.entries(BUNDLES)) {
      for (const key of keys) {
        const text = at(bundle, key);
        expect(text, `${locale} ${key}`).toBeTruthy();
        if (locale !== 'en-US') expect(text, `${locale} ${key} is translated`).not.toBe(at(enUS, key));
      }
    }
  });

  it('keeps every interpolation param of en-US in the other bundles', () => {
    const params = (text: string | undefined): string[] => [...(text ?? '').matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort();
    const walk = (node: unknown, prefix: string, out: string[]): string[] => {
      if (typeof node === 'string') out.push(prefix);
      else if (node && typeof node === 'object') for (const [key, value] of Object.entries(node)) walk(value, prefix ? `${prefix}.${key}` : key, out);
      return out;
    };
    const keys = [
      ...walk((enUS as { ACCOUNTING: Record<string, unknown> }).ACCOUNTING['BILLS'], 'ACCOUNTING.BILLS', []),
      ...walk((enUS as { ACCOUNTING: Record<string, unknown> }).ACCOUNTING['APPROVAL_LIMITS'], 'ACCOUNTING.APPROVAL_LIMITS', []),
    ];
    for (const [locale, bundle] of Object.entries(BUNDLES)) {
      for (const key of keys) expect(params(at(bundle, key)), `${locale} ${key}`).toEqual(params(at(enUS, key)));
    }
  });
});
