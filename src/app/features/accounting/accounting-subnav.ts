import { ACCOUNTING_PAGE } from '../../core/security/route-permissions';

/** One entry of the accounting sub-navigation (SPEC-accounting-workspace §5.0). */
export interface AccountingSubnavEntry {
  /** i18n key of the visible label (`ACCOUNTING.SHELL.NAV.*`). */
  readonly labelKey: string;
  /** i18n key of the accountant's term, shown beside the label with Show accounting terms on. */
  readonly termKey?: string;
  /** Path relative to `/app/accounting`; `''` is the home. */
  readonly route: string;
  /** The same any-of codes as the route's `data.permissions`; absent for an ungated route. */
  readonly permissions?: readonly string[];
}

/**
 * The accounting sub-navigation, in §5.0 order. An entry is shown only when
 * the session can open its route (`canAccess`), so it carries the route's own
 * gate — `accounting-subnav.spec.ts` fails when the two disagree.
 *
 * Adding a page (S14 Bills to pay): add
 * its route to `ACCOUNTING_ROUTES` first, then its entry here at its §5.0
 * position (Home · Bills to pay · Customer payments · Bank · Your books ·
 * Month-end) with the route's permissions, and its label keys to all six
 * locale bundles under `ACCOUNTING.SHELL.NAV`. Repointing Bills to pay (S14)
 * changes `route` and `permissions` together.
 */
export const ACCOUNTING_SUBNAV: readonly AccountingSubnavEntry[] = [
  { labelKey: 'ACCOUNTING.SHELL.NAV.HOME', route: '' },
  {
    labelKey: 'ACCOUNTING.SHELL.NAV.BILLS',
    termKey: 'ACCOUNTING.SHELL.NAV.BILLS_TERM',
    route: 'payables/vendor-invoices',
    permissions: ACCOUNTING_PAGE.vendorInvoices,
  },
  {
    labelKey: 'ACCOUNTING.SHELL.NAV.CUSTOMER_PAYMENTS',
    termKey: 'ACCOUNTING.SHELL.NAV.CUSTOMER_PAYMENTS_TERM',
    route: 'payments',
    permissions: ACCOUNTING_PAGE.customerPayments,
  },
  {
    labelKey: 'ACCOUNTING.SHELL.NAV.BANK',
    termKey: 'ACCOUNTING.SHELL.NAV.BANK_TERM',
    route: 'bank-accounts',
    permissions: ACCOUNTING_PAGE.bankAccounts,
  },
  {
    labelKey: 'ACCOUNTING.SHELL.NAV.BOOKS',
    termKey: 'ACCOUNTING.SHELL.NAV.BOOKS_TERM',
    route: 'books',
    permissions: ACCOUNTING_PAGE.books,
  },
  {
    labelKey: 'ACCOUNTING.SHELL.NAV.MONTH_END',
    termKey: 'ACCOUNTING.SHELL.NAV.MONTH_END_TERM',
    route: 'periods',
    permissions: ACCOUNTING_PAGE.periodClose,
  },
];
