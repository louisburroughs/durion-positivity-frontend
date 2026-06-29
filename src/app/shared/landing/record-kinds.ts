import { RecordKind, RecordKindMeta } from './landing.models';

/**
 * Static registry of record-kind metadata. i18n keys live under `LANDING.KIND.*`.
 * `nameSearch: true` kinds resolve through a backend typeahead; `false` kinds
 * accept a raw identifier with no lookup.
 */
export const RECORD_KINDS: Record<RecordKind, RecordKindMeta> = {
  estimate: { labelKey: 'LANDING.KIND.ESTIMATE.LABEL', placeholderKey: 'LANDING.KIND.ESTIMATE.PLACEHOLDER', nameSearch: true },
  workorder: { labelKey: 'LANDING.KIND.WORKORDER.LABEL', placeholderKey: 'LANDING.KIND.WORKORDER.PLACEHOLDER', nameSearch: true },
  approval: { labelKey: 'LANDING.KIND.APPROVAL.LABEL', placeholderKey: 'LANDING.KIND.APPROVAL.PLACEHOLDER', nameSearch: true },
  customer: { labelKey: 'LANDING.KIND.CUSTOMER.LABEL', placeholderKey: 'LANDING.KIND.CUSTOMER.PLACEHOLDER', nameSearch: true },
  invoice: { labelKey: 'LANDING.KIND.INVOICE.LABEL', placeholderKey: 'LANDING.KIND.INVOICE.PLACEHOLDER', nameSearch: true },
  employee: { labelKey: 'LANDING.KIND.EMPLOYEE.LABEL', placeholderKey: 'LANDING.KIND.EMPLOYEE.PLACEHOLDER', nameSearch: true },
  person: { labelKey: 'LANDING.KIND.PERSON.LABEL', placeholderKey: 'LANDING.KIND.PERSON.PLACEHOLDER', nameSearch: true },
  appointment: { labelKey: 'LANDING.KIND.APPOINTMENT.LABEL', placeholderKey: 'LANDING.KIND.APPOINTMENT.PLACEHOLDER', nameSearch: false },
  ledger: { labelKey: 'LANDING.KIND.LEDGER.LABEL', placeholderKey: 'LANDING.KIND.LEDGER.PLACEHOLDER', nameSearch: false },
  po: { labelKey: 'LANDING.KIND.PO.LABEL', placeholderKey: 'LANDING.KIND.PO.PLACEHOLDER', nameSearch: false },
  event: { labelKey: 'LANDING.KIND.EVENT.LABEL', placeholderKey: 'LANDING.KIND.EVENT.PLACEHOLDER', nameSearch: false },
  ruleset: { labelKey: 'LANDING.KIND.RULESET.LABEL', placeholderKey: 'LANDING.KIND.RULESET.PLACEHOLDER', nameSearch: false },
  vendorPayment: { labelKey: 'LANDING.KIND.VENDOR_PAYMENT.LABEL', placeholderKey: 'LANDING.KIND.VENDOR_PAYMENT.PLACEHOLDER', nameSearch: false },
  location: { labelKey: 'LANDING.KIND.LOCATION.LABEL', placeholderKey: 'LANDING.KIND.LOCATION.PLACEHOLDER', nameSearch: false },
  role: { labelKey: 'LANDING.KIND.ROLE.LABEL', placeholderKey: 'LANDING.KIND.ROLE.PLACEHOLDER', nameSearch: false },
  payment: { labelKey: 'LANDING.KIND.PAYMENT.LABEL', placeholderKey: 'LANDING.KIND.PAYMENT.PLACEHOLDER', nameSearch: false },
  receipt: { labelKey: 'LANDING.KIND.RECEIPT.LABEL', placeholderKey: 'LANDING.KIND.RECEIPT.PLACEHOLDER', nameSearch: false },
  session: { labelKey: 'LANDING.KIND.SESSION.LABEL', placeholderKey: 'LANDING.KIND.SESSION.PLACEHOLDER', nameSearch: false },
  putaway: { labelKey: 'LANDING.KIND.PUTAWAY.LABEL', placeholderKey: 'LANDING.KIND.PUTAWAY.PLACEHOLDER', nameSearch: false },
};
