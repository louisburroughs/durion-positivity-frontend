import { ACCOUNTING_PAGE } from '../../../../core/security/route-permissions';
import { LandingPageConfig } from '../../../../shared/landing/landing.models';

/**
 * Accounting landing configuration consumed by the shared {@link LandingPageComponent}.
 * Reuses the existing ACCOUNTING.LANDING.* i18n keys. The original "Payments"
 * section mixed two id kinds (vendor payment + invoice) and is split here so each
 * section resolves a single record kind.
 */
/**
 * Every card carries the same access requirement as the route it opens, so the
 * shared landing component can drop the ones this session's permissions would
 * bounce at the guard. Keep the two in step — `core/security/page-access.spec.ts` fails the
 * build when a card and its route disagree.
 */
export const ACCOUNTING_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.ACCOUNTING',
  titleKey: 'ACCOUNTING.LANDING.TITLE',
  descriptionKey: 'ACCOUNTING.LANDING.SUBTITLE',
  primaryCta: {
    labelKey: 'ACCOUNTING.LANDING.HERO.OPEN_EVENTS',
    icon: 'receipt_long',
    route: '/app/accounting/events',
    permissions: ACCOUNTING_PAGE.events,
  },
  secondaryCta: {
    labelKey: 'ACCOUNTING.LANDING.HERO.OPEN_POSTING_RULES',
    route: '/app/accounting/posting-rules',
    permissions: ACCOUNTING_PAGE.postingRules,
  },
  sections: [
    {
      titleKey: 'ACCOUNTING.LANDING.SECTION.INGESTION.TITLE',
      descriptionKey: 'ACCOUNTING.LANDING.SECTION.INGESTION.DESCRIPTION',
      recordKind: 'event',
      cards: [
        {
          kind: 'direct',
          icon: 'inbox',
          titleKey: 'ACCOUNTING.LANDING.CARD.EVENTS.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENTS.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/events',
          permissions: ACCOUNTING_PAGE.events,
        },
        {
          kind: 'direct',
          icon: 'description',
          titleKey: 'ACCOUNTING.LANDING.CARD.EVENTS_CONTRACT.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENTS_CONTRACT.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/events/contract',
          permissions: ACCOUNTING_PAGE.events,
        },
        {
          kind: 'direct',
          icon: 'send',
          titleKey: 'ACCOUNTING.LANDING.CARD.EVENTS_SUBMIT.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENTS_SUBMIT.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/events/submit',
          permissions: ACCOUNTING_PAGE.eventsSubmit,
        },
        {
          kind: 'direct',
          icon: 'error_outline',
          titleKey: 'ACCOUNTING.LANDING.CARD.EVENTS_FAILED.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENTS_FAILED.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/events/failed',
          permissions: ACCOUNTING_PAGE.events,
        },
        {
          kind: 'guided',
          icon: 'search',
          titleKey: 'ACCOUNTING.LANDING.CARD.EVENT_DETAIL.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.EVENT_DETAIL.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_EVENT',
          buildCommands: (id: string) => ['/app', 'accounting', 'events', id],
          permissions: ACCOUNTING_PAGE.events,
        },
      ],
    },
    {
      titleKey: 'ACCOUNTING.LANDING.SECTION.POSTING_RULES.TITLE',
      descriptionKey: 'ACCOUNTING.LANDING.SECTION.POSTING_RULES.DESCRIPTION',
      recordKind: 'ruleset',
      cards: [
        {
          kind: 'direct',
          icon: 'rule',
          titleKey: 'ACCOUNTING.LANDING.CARD.POSTING_RULES_LIST.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.POSTING_RULES_LIST.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/posting-rules',
          permissions: ACCOUNTING_PAGE.postingRules,
        },
        {
          kind: 'guided',
          icon: 'tune',
          titleKey: 'ACCOUNTING.LANDING.CARD.POSTING_RULES_DETAIL.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.POSTING_RULES_DETAIL.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_RULE_SET',
          buildCommands: (id: string) => ['/app', 'accounting', 'posting-rules', id],
          permissions: ACCOUNTING_PAGE.postingRules,
        },
      ],
    },
    {
      titleKey: 'ACCOUNTING.LANDING.SECTION.PAYMENTS.TITLE',
      descriptionKey: 'ACCOUNTING.LANDING.SECTION.PAYMENTS.DESCRIPTION',
      recordKind: 'vendorPayment',
      cards: [
        {
          kind: 'direct',
          icon: 'payments',
          titleKey: 'ACCOUNTING.LANDING.CARD.PAYMENT_APPLY.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.PAYMENT_APPLY.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/payments/apply',
          permissions: ACCOUNTING_PAGE.paymentApply,
        },
        {
          kind: 'direct',
          icon: 'account_balance',
          titleKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENTS.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENTS.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/vendor-payments',
          permissions: ACCOUNTING_PAGE.vendorPaymentView,
        },
        {
          kind: 'direct',
          icon: 'add_card',
          titleKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENTS_NEW.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENTS_NEW.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/vendor-payments/new',
          permissions: ACCOUNTING_PAGE.vendorPaymentExecute,
        },
        {
          kind: 'guided',
          icon: 'receipt',
          titleKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENT_DETAIL.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.VENDOR_PAYMENT_DETAIL.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_VENDOR_PAYMENT',
          buildCommands: (id: string) => ['/app', 'accounting', 'vendor-payments', id],
          permissions: ACCOUNTING_PAGE.vendorPaymentView,
        },
      ],
    },
    {
      titleKey: 'ACCOUNTING.LANDING.CARD.INVOICE_PAYMENT_STATUS.TITLE',
      descriptionKey: 'ACCOUNTING.LANDING.CARD.INVOICE_PAYMENT_STATUS.DESCRIPTION',
      recordKind: 'invoice',
      idMode: true,
      cards: [
        {
          kind: 'guided',
          icon: 'fact_check',
          titleKey: 'ACCOUNTING.LANDING.CARD.INVOICE_PAYMENT_STATUS.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.INVOICE_PAYMENT_STATUS.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_INVOICE_STATUS',
          buildCommands: (id: string) => ['/app', 'accounting', 'invoices', id, 'payment-status'],
          permissions: ACCOUNTING_PAGE.invoicePaymentStatus,
        },
      ],
    },
    {
      titleKey: 'ACCOUNTING.LANDING.SECTION.CREDIT_MEMOS.TITLE',
      descriptionKey: 'ACCOUNTING.LANDING.SECTION.CREDIT_MEMOS.DESCRIPTION',
      recordKind: 'creditMemo',
      cards: [
        {
          kind: 'direct',
          icon: 'request_quote',
          titleKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMOS_LIST.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMOS_LIST.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/credit-memos',
          permissions: ACCOUNTING_PAGE.creditMemoView,
        },
        {
          kind: 'direct',
          icon: 'post_add',
          titleKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMOS_NEW.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMOS_NEW.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/credit-memos/new',
          permissions: ACCOUNTING_PAGE.creditMemoCreate,
        },
        {
          kind: 'guided',
          icon: 'description',
          titleKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMO_DETAIL.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.CREDIT_MEMO_DETAIL.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_CREDIT_MEMO',
          buildCommands: (id: string) => ['/app', 'accounting', 'credit-memos', id],
          permissions: ACCOUNTING_PAGE.creditMemoView,
        },
      ],
    },
    /**
     * Payables — vendor bills read end to end through pos-accounting's
     * vendor-bills API (#214). PR #202 retired the prior supplier-backed
     * surface because pos-supplier has no raw-invoice read
     * (#1637/#1638 owner decision); this is a move to the real contract, not
     * a restoration of the old one. `idMode` keeps the guided card a plain
     * identifier input: the `invoice` kind's typeahead searches billing
     * invoices, a different record from a vendor bill, and would return
     * confidently wrong matches.
     */
    {
      titleKey: 'ACCOUNTING.LANDING.SECTION.PAYABLES.TITLE',
      descriptionKey: 'ACCOUNTING.LANDING.SECTION.PAYABLES.DESCRIPTION',
      recordKind: 'invoice',
      idMode: true,
      cards: [
        {
          kind: 'direct',
          icon: 'receipt_long',
          titleKey: 'ACCOUNTING.LANDING.CARD.PAYABLES_LIST.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.PAYABLES_LIST.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/payables/vendor-invoices',
          permissions: ACCOUNTING_PAGE.vendorInvoices,
        },
        {
          kind: 'direct',
          icon: 'report_problem',
          titleKey: 'ACCOUNTING.LANDING.CARD.PAYABLES_EXCEPTIONS.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.PAYABLES_EXCEPTIONS.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/payables/vendor-invoices/exceptions',
          permissions: ACCOUNTING_PAGE.vendorInvoices,
        },
        {
          kind: 'guided',
          icon: 'find_in_page',
          titleKey: 'ACCOUNTING.LANDING.CARD.PAYABLES_DETAIL.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.PAYABLES_DETAIL.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_VENDOR_BILL',
          buildCommands: (id: string) => ['/app', 'accounting', 'payables', 'vendor-invoices', id],
          permissions: ACCOUNTING_PAGE.vendorInvoiceDetail,
        },
      ],
    },
    {
      titleKey: 'ACCOUNTING.LANDING.SECTION.REPORTS.TITLE',
      descriptionKey: 'ACCOUNTING.LANDING.SECTION.REPORTS.DESCRIPTION',
      cards: [
        {
          kind: 'direct',
          icon: 'summarize',
          titleKey: 'ACCOUNTING.LANDING.CARD.LABOR_OVERHEAD.TITLE',
          descriptionKey: 'ACCOUNTING.LANDING.CARD.LABOR_OVERHEAD.DESCRIPTION',
          ctaKey: 'ACCOUNTING.LANDING.ACTION.OPEN_PAGE',
          route: '/app/accounting/reports/labor-overhead',
          permissions: ACCOUNTING_PAGE.laborOverheadReport,
        },
      ],
    },
  ],
};
