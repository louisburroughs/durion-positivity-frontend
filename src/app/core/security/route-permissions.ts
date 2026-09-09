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

/**
 * `/app/crm` — parties, contacts, vehicles, and the vehicle bulk imports it hosts.
 * The two trailing codes are exactly what the group's own cross-domain pages are
 * gated on (three bulk-import consoles, the CRM integration monitor); a group has
 * to admit anyone its pages admit, or the page gate becomes a dead end. Full
 * codes, not prefixes — the rest of those domains has no page here.
 */
export const CRM_PERMISSIONS = permissionsInDomains(
  'crm:',
  'vehicle-inventory:',
  'vehicle-fitment:',
  'bulkImport:upload:execute',
  'accounting:events:view',
);

/** `/app/workexec` — estimates, work orders, labor, parts, WIP. */
export const WORKEXEC_PERMISSIONS = permissionsInDomains('workorder:');

/**
 * `/app/accounting` — journal entries, payables, posting rules, credit memos.
 * The trailing code is what the labor-overhead report it hosts is gated on.
 */
export const ACCOUNTING_PERMISSIONS = permissionsInDomains(
  'accounting:',
  'reporting:view:financial-statements',
);

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

/**
 * `/app/inventory` — on-hand, receiving, putaway, counts, purchase orders, fulfillment.
 * The trailing codes are exactly what the group's own cross-domain pages are
 * gated on: the purchase-order pages (served by pos-order), the opening-stock
 * import, and the inventory permission matrix. A group has to admit anyone its
 * pages admit, or the page gate becomes a dead end. Full codes, not prefixes —
 * the rest of those domains has no page here.
 */
export const INVENTORY_PERMISSIONS = permissionsInDomains(
  'inventory:',
  'order:purchase_order:view',
  'order:purchase_order:create',
  'bulkImport:upload:execute',
  'security:permission:view',
);

/** `/app/product` — catalog, pricing, product lifecycle, and the availability/feed views. */
export const PRODUCT_PERMISSIONS = permissionsInDomains('catalog:', 'pricing:', 'product:');

/** `/app/order` — carts, order lines, price overrides, returns. */
export const ORDER_PERMISSIONS = permissionsInDomains('order:');

/** `/app/shopmgmt` — shop dashboard, dispatch board, schedule, appointments, mechanics. */
export const SHOPMGMT_PERMISSIONS = permissionsInDomains('shop:', 'appointments:');

/** `/app/bulk-import` — the bulk import job console. */
export const BULK_IMPORT_PERMISSIONS = permissionsInDomains('bulkImport:');

/* ------------------------------------------------------------------------- *
 * Page-level permissions
 * ----------------------
 * The group gates above answer "does this user have business in this domain".
 * The tables below answer "can this page's primary read succeed" — traced
 * mechanically page → service → endpoint → the controller's `@PreAuthorize`,
 * which the backend publishes per operation as `x-required-permissions` in each
 * module's `openapi.yaml`.
 *
 * A page is gated on the permission its *primary read* needs — the one without
 * which the page has nothing to show — not the union of everything it might
 * call, or the page over-gates on a secondary action. Pages that exist to write
 * (create forms, submit screens) are gated on the write instead: without it the
 * only possible outcome is a 403 on submit.
 *
 * Gates compose. `rolesChildGuard` runs for every route in the activated path,
 * so a page gate is ANDed with its group gate. Where a page needs a code from
 * another domain (inventory hosts purchase orders, CRM hosts bulk imports and
 * the accounting event monitor), that code is folded into the group set above
 * as well — otherwise holding only it would be a dead end of its own.
 * ------------------------------------------------------------------------- */

/** `/app/inventory/*` — one entry per routed page, keyed by route path. */
export const INVENTORY_PAGE = {
  /** `getLocationRollup` / `getSiteRollup` — the on-hand rollup the page renders. */
  byLocation: ['inventory:on_hand:view'],
  /** `listAvailabilityBySku`; the product typeahead is a secondary picker. */
  availability: ['inventory:availability:read'],
  ledger: ['inventory:ledger:view'],
  /** `getReceivingDocument` / `getAsn` both sit behind the receiving read. */
  receiving: ['inventory:receiving:view'],
  /** `crossDockReceivingLine` ANDs both authorities (`ReceivingController`). */
  receivingCrossDock: ['inventory:receiving:complete', 'inventory:issue:parts'],
  putaway: ['inventory:putaway:view'],
  /** `listReplenishmentTasks` is gated on the plain inventory view authority. */
  replenishment: ['inventory:on_hand:view'],
  cycleCount: ['inventory:cycle_count:view'],
  /** The plan form exists to create a plan; the location pickers are secondary. */
  cycleCountPlanCreate: ['inventory:cycle_count:initiate'],
  /** `listCycleCountAdjustments` uses `hasAnyAuthority` over both codes. */
  adjustments: ['inventory:adjustment:view', 'inventory:adjustment:approve'],
  pickList: ['inventory:pick_list:view'],
  returnToStock: ['inventory:return:view'],
  shortageResolution: ['inventory:shortage:view'],
  /** Purchase orders live under /app/inventory but are served by pos-order. */
  purchaseOrderView: ['order:purchase_order:view'],
  purchaseOrderEdit: ['order:purchase_order:create'],
  /** The permission-matrix admin page reads the security service's registry. */
  securityAdmin: ['security:permission:view'],
  /** Bulk import pages exist to upload; the job polling read is secondary. */
  bulkImport: ['bulkImport:upload:execute'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/accounting/*` — one entry per routed page, keyed by route path. */
export const ACCOUNTING_PAGE = {
  events: ['accounting:events:view'],
  eventsSubmit: ['accounting:events:submit'],
  postingRules: ['accounting:posting_rules:view'],
  paymentApply: ['accounting:payment:apply'],
  creditMemoView: ['accounting:credit-memo:read'],
  creditMemoCreate: ['accounting:credit-memo:create'],
  vendorPaymentView: ['accounting:ap:view'],
  /** `executePayment` — the page exists to pay, not to browse bills. */
  vendorPaymentExecute: ['accounting:ap:pay'],
  /** `listVendorBills` is gated on the analytics read, not `ap:view`. */
  vendorInvoices: ['accounting:analytics:view'],
  vendorInvoiceDetail: ['accounting:ap:view'],
  laborOverheadReport: ['reporting:view:financial-statements'],
  invoicePaymentStatus: ['accounting:ap:view'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/crm/*` — one entry per routed page, keyed by route path. */
export const CRM_PAGE = {
  parties: ['crm:party:view'],
  partyCreate: ['crm:party:create'],
  personCreate: ['crm:person:create'],
  /** `createVehicleForParty` posts to the vehicle registry, not to CRM. */
  vehicleCreate: ['vehicle-inventory:registry:create'],
  /** The contacts page renders relationships; the party header is secondary. */
  partyContacts: ['crm:relationship:read'],
  partyMerge: ['crm:party:merge'],
  billingRules: ['crm:party:view'],
  /** The CRM integration monitor reads the accounting ingestion events. */
  integrationEvents: ['accounting:events:view'],
  bulkImport: ['bulkImport:upload:execute'],
} as const satisfies Record<string, readonly string[]>;
