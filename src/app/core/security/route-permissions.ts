import { PERMISSION_BY_BIT } from './permission-catalog';

/**
 * route-permissions.ts
 * --------------------
 * The route group → permission mapping that gates `/app`.
 *
 * Groups are gated on the *union of their domain's permissions* rather than on
 * a single hand-picked code. Holding any permission in a domain is what gives a
 * user business in that part of the UI, so this gate can only ever exclude
 * someone the backend would refuse outright — it cannot lock out a user who
 * legitimately holds a permission we forgot to list. Individual pages inside a
 * group can still 403; those pages map 403 to a `forbidden` state and are gated
 * more finely as their per-page permission is confirmed.
 *
 * Domains come from the backend permission catalog (`permission-catalog.ts`),
 * so codes added backend-side flow in when the catalog is regenerated instead
 * of silently drifting.
 */

/** Every catalog permission whose code starts with one of the given domain prefixes. */
export function permissionsInDomains(...prefixes: readonly string[]): readonly string[] {
  return PERMISSION_BY_BIT.filter(code => prefixes.some(prefix => code.startsWith(prefix)));
}

/** `/app/crm` — parties, contacts, vehicles, and the vehicle bulk imports it hosts. */
export const CRM_PERMISSIONS = permissionsInDomains('crm:', 'vehicle-inventory:', 'vehicle-fitment:');

/** `/app/workexec` — estimates, work orders, labor, parts, WIP. */
export const WORKEXEC_PERMISSIONS = permissionsInDomains('workorder:');

/** `/app/accounting` — journal entries, payables, posting rules, credit memos. */
export const ACCOUNTING_PERMISSIONS = permissionsInDomains('accounting:');

/** `/app/billing` — customer invoices, payment capture, receipts. */
export const BILLING_PERMISSIONS = permissionsInDomains(
  'invoice:',
  'accounting:payment:',
  'accounting:customer-credit:',
);

/** `/app/people` — employees, RBAC, timekeeping, the people directory. */
export const PEOPLE_PERMISSIONS = permissionsInDomains(
  'people:',
  'people-contact:',
  'timekeeping:',
  'TimeEntry:',
);

/** `/app/location` — sites, bays, mobile units, storage locations. */
export const LOCATION_PERMISSIONS = permissionsInDomains('location:');

/** `/app/inventory` — on-hand, receiving, putaway, counts, purchase orders, fulfillment. */
export const INVENTORY_PERMISSIONS = permissionsInDomains('inventory:');

/** `/app/product` — catalog, pricing, product lifecycle, and the availability/feed views. */
export const PRODUCT_PERMISSIONS = permissionsInDomains('catalog:', 'pricing:', 'product:');

/** `/app/order` — carts, order lines, price overrides, returns. */
export const ORDER_PERMISSIONS = permissionsInDomains('order:');

/** `/app/shopmgmt` — shop dashboard, dispatch board, schedule, appointments, mechanics. */
export const SHOPMGMT_PERMISSIONS = permissionsInDomains('shop:', 'appointments:');

/** `/app/bulk-import` — the bulk import job console. */
export const BULK_IMPORT_PERMISSIONS = permissionsInDomains('bulkImport:');
