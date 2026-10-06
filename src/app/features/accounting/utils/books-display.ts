import { JournalEntry } from '../models/books.models';

/**
 * Display helpers shared by Your books and the journal-entry page (CAP:550 S5).
 * Every key is written literally so the i18n check sees it; anything the
 * server serves that is not listed here renders as "Unknown" or "Other", never
 * blank (story "Alternate and error flows").
 */

/** Where a statement line sits on the Summary. Unlisted codes go to `OTHER`. */
export type SummarySection = 'OWN' | 'OWE' | 'YOURS' | 'INCOME';

/**
 * The plain labels of the documented statement lines (S35 seed and computed
 * lines; story PROPOSED 4). This only translates a served code: nothing reads
 * an amount by its code, and a code missing from this list is still rendered,
 * under "Other" with its code shown when terms are on (Accounting ruling on
 * backend #2524: consumers never depend on a particular line code).
 */
export const STATEMENT_LINES: Readonly<Record<string, { readonly section: SummarySection; readonly key: string }>> = {
  BS_IN_THE_BANK: { section: 'OWN', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.IN_THE_BANK' },
  BS_WAITING_TO_BE_DEPOSITED: { section: 'OWN', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.WAITING_TO_BE_DEPOSITED' },
  BS_KEPT_IN_DRAWERS: { section: 'OWN', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.KEPT_IN_DRAWERS' },
  BS_CUSTOMERS_OWE_YOU: { section: 'OWN', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.CUSTOMERS_OWE_YOU' },
  BS_INVENTORY: { section: 'OWN', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.INVENTORY' },
  BS_OTHER_ASSETS: { section: 'OWN', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.OTHER_ASSETS' },
  BS_BILLS_FROM_VENDORS: { section: 'OWE', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.BILLS_FROM_VENDORS' },
  BS_SALES_TAX_COLLECTED: { section: 'OWE', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.SALES_TAX_COLLECTED' },
  BS_CUSTOMER_CREDITS: { section: 'OWE', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.CUSTOMER_CREDITS' },
  BS_OTHER_LIABILITIES: { section: 'OWE', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.OTHER_LIABILITIES' },
  BS_OWNER_EQUITY: { section: 'YOURS', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.OWNER_EQUITY' },
  BS_OPENING_BALANCE_EQUITY: { section: 'YOURS', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.OPENING_BALANCE_EQUITY' },
  BS_PROFIT_NOT_YET_CLOSED: { section: 'YOURS', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.PROFIT_NOT_YET_CLOSED' },
  BS_OTHER_EQUITY: { section: 'YOURS', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.OTHER_EQUITY' },
  IS_SALES: { section: 'INCOME', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.SALES' },
  IS_COST_OF_PARTS_SOLD: { section: 'INCOME', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.COST_OF_PARTS_SOLD' },
  IS_CARD_PROCESSING_FEES: { section: 'INCOME', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.CARD_PROCESSING_FEES' },
  IS_OTHER_INCOME: { section: 'INCOME', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.OTHER_INCOME' },
  IS_OTHER_EXPENSES: { section: 'INCOME', key: 'ACCOUNTING.BOOKS.SUMMARY.LINE.OTHER_EXPENSES' },
};

/** The label of a line nobody documented: "Other", with the code shown under terms. */
export const OTHER_LINE_KEY = 'ACCOUNTING.BOOKS.SUMMARY.LINE.UNLISTED';

/** Source types `pos-accounting` stamps (`JournalEntrySourceTypes`), in plain words. */
export const SOURCE_TYPES: ReadonlySet<string> = new Set([
  'MANUAL',
  'INVOICE_REVENUE',
  'INVOICE_REVENUE_REVERSAL',
  'PAYMENT_APPLICATION',
  'CUSTOMER_CREDIT_ISSUANCE',
  'CUSTOMER_CREDIT_RELIEF',
  'CREDIT_MEMO_REVERSAL',
  'CREDIT_MEMO_VOID',
  'INVENTORY_SHRINKAGE',
  'INVENTORY_ADJUSTMENT',
  'INVENTORY_REVALUATION',
  'SETTLEMENT',
  'SETTLEMENT_WRITE_OFF',
  'SETTLEMENT_RECLASS',
  'REGISTER_OVER_SHORT',
  'LEGACY_REVERSAL',
]);

export function sourceTypeKey(sourceType: string | null): string {
  return sourceType && SOURCE_TYPES.has(sourceType)
    ? `ACCOUNTING.BOOKS.ENTRY.SOURCE.${sourceType}`
    : 'ACCOUNTING.BOOKS.ENTRY.SOURCE.UNKNOWN';
}

/** Entry status labels (story PROPOSED 6); one truthful key per served state (ADR-0064 §4). */
export function entryStatusKey(entry: Pick<JournalEntry, 'status' | 'reversalJournalEntryId'>): string {
  switch (entry.status) {
    case 'REVERSED':
      return 'ACCOUNTING.BOOKS.STATUS.REVERSED';
    case 'POSTED':
      return entry.reversalJournalEntryId ? 'ACCOUNTING.BOOKS.STATUS.CORRECTION' : 'ACCOUNTING.BOOKS.STATUS.RECORDED';
    case 'DRAFT':
    case 'PENDING':
      return 'ACCOUNTING.BOOKS.STATUS.NOT_RECORDED';
    default:
      return 'ACCOUNTING.BOOKS.STATUS.UNKNOWN';
  }
}

/** The status badge modifier: text carries the meaning, colour only repeats it (§5.7). */
export function entryStatusTone(entry: Pick<JournalEntry, 'status' | 'reversalJournalEntryId'>): string {
  switch (entry.status) {
    case 'REVERSED':
      return 'status-badge--blocking';
    case 'POSTED':
      return entry.reversalJournalEntryId ? 'status-badge--warning' : 'status-badge--open';
    default:
      return '';
  }
}

/** What a "What happened" cell shows: a translated key, or the served text. */
export type WhatHappened = { readonly key: string } | { readonly text: string } | null;

/** `pos-accounting` writes a reversal's description as "REVERSAL of <original UUID> - Reason: …". */
const REVERSAL_DESCRIPTION = /^REVERSAL of\b/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export const CORRECTION_DESCRIPTION_KEY = 'ACCOUNTING.BOOKS.CORRECTION_DESCRIPTION';

/**
 * A served description as display text. A reversal's stored description names
 * the original by UUID, so it reads "Correction of an earlier entry" instead
 * (story EXISTING 6); any other UUID in served text is masked, never shown
 * (P8, ADR-0064 §5). Text renders through interpolation, never `[innerHTML]`.
 */
export function describeText(description: string | null): WhatHappened {
  if (!description) return null;
  if (REVERSAL_DESCRIPTION.test(description)) return { key: CORRECTION_DESCRIPTION_KEY };
  return { text: description.replace(UUID, '…') };
}

/** An entry's "What happened": a correcting entry never shows its stored description. */
export function describeEntry(entry: Pick<JournalEntry, 'description' | 'reversalJournalEntryId'>): WhatHappened {
  return entry.reversalJournalEntryId ? { key: CORRECTION_DESCRIPTION_KEY } : describeText(entry.description);
}

export function isKey(value: WhatHappened): value is { readonly key: string } {
  return !!value && 'key' in value;
}
