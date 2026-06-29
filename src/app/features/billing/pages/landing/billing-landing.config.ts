import { LandingPageConfig } from '../../../../shared/landing/landing.models';

const inv = (...rest: string[]) => (id: string): string[] => ['/app', 'billing', 'invoices', id, ...rest];

/**
 * Billing landing configuration consumed by the shared {@link LandingPageComponent}.
 * Every section resolves an invoice via the shared invoice finder (customer name,
 * invoice number, or workorder number). Void/Refund and Receipt Detail capture a
 * second identifier on the card.
 */
export const BILLING_LANDING_CONFIG: LandingPageConfig = {
  eyebrowKey: 'SHELL.NAV.BILLING',
  titleKey: 'BILLING.LANDING.TITLE',
  descriptionKey: 'BILLING.LANDING.SUBTITLE',
  sections: [
    {
      titleKey: 'BILLING.LANDING.SECTION.INVOICES.TITLE',
      descriptionKey: 'BILLING.LANDING.SECTION.INVOICES.DESCRIPTION',
      recordKind: 'invoice',
      cards: [
        {
          kind: 'guided',
          icon: 'description',
          titleKey: 'BILLING.LANDING.CARD.INVOICE_DETAIL.TITLE',
          descriptionKey: 'BILLING.LANDING.CARD.INVOICE_DETAIL.DESCRIPTION',
          ctaKey: 'BILLING.LANDING.ACTION.OPEN_INVOICE',
          buildCommands: inv(),
        },
      ],
    },
    {
      titleKey: 'BILLING.LANDING.SECTION.PAYMENTS.TITLE',
      descriptionKey: 'BILLING.LANDING.SECTION.PAYMENTS.DESCRIPTION',
      recordKind: 'invoice',
      cards: [
        {
          kind: 'guided',
          icon: 'payments',
          titleKey: 'BILLING.LANDING.CARD.PAYMENT_CAPTURE.TITLE',
          descriptionKey: 'BILLING.LANDING.CARD.PAYMENT_CAPTURE.DESCRIPTION',
          ctaKey: 'BILLING.LANDING.ACTION.OPEN_PAYMENT_CAPTURE',
          buildCommands: inv('payment-capture'),
        },
        {
          kind: 'guided',
          icon: 'undo',
          titleKey: 'BILLING.LANDING.CARD.PAYMENT_VOID_REFUND.TITLE',
          descriptionKey: 'BILLING.LANDING.CARD.PAYMENT_VOID_REFUND.DESCRIPTION',
          ctaKey: 'BILLING.LANDING.ACTION.OPEN_VOID_REFUND',
          secondary: {
            labelKey: 'BILLING.LANDING.FIELD.PAYMENT_ID',
            placeholderKey: 'BILLING.LANDING.PLACEHOLDER.PAYMENT_ID',
          },
          buildCommands: (id, paymentId) => [
            '/app',
            'billing',
            'invoices',
            id,
            'payments',
            paymentId ?? '',
            'void-refund',
          ],
        },
      ],
    },
    {
      titleKey: 'BILLING.LANDING.SECTION.RECEIPTS.TITLE',
      descriptionKey: 'BILLING.LANDING.SECTION.RECEIPTS.DESCRIPTION',
      recordKind: 'invoice',
      cards: [
        {
          kind: 'guided',
          icon: 'receipt',
          titleKey: 'BILLING.LANDING.CARD.RECEIPT_LIST.TITLE',
          descriptionKey: 'BILLING.LANDING.CARD.RECEIPT_LIST.DESCRIPTION',
          ctaKey: 'BILLING.LANDING.ACTION.OPEN_RECEIPT_LIST',
          buildCommands: inv('receipts'),
        },
        {
          kind: 'guided',
          icon: 'description',
          titleKey: 'BILLING.LANDING.CARD.RECEIPT_DETAIL.TITLE',
          descriptionKey: 'BILLING.LANDING.CARD.RECEIPT_DETAIL.DESCRIPTION',
          ctaKey: 'BILLING.LANDING.ACTION.OPEN_RECEIPT_DETAIL',
          secondary: {
            labelKey: 'BILLING.LANDING.FIELD.RECEIPT_ID',
            placeholderKey: 'BILLING.LANDING.PLACEHOLDER.RECEIPT_ID',
          },
          buildCommands: (id, receiptId) => [
            '/app',
            'billing',
            'invoices',
            id,
            'receipts',
            receiptId ?? '',
          ],
        },
      ],
    },
  ],
};
