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

/**
 * Every catalog permission matching one of the given selectors.
 *
 * A selector ending in `:` is a domain prefix and matches every code beneath it
 * (`'inventory:'` → all of pos-inventory's codes). Any other selector is a whole
 * code and matches only itself, so folding one domain's page permission into
 * another group cannot quietly pull in codes added under the same prefix later.
 */
export function permissionsInDomains(...selectors: readonly string[]): readonly string[] {
  return PERMISSION_BY_BIT.filter(code =>
    selectors.some(selector => (selector.endsWith(':') ? code.startsWith(selector) : code === selector)),
  );
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

/** `/app/platform/*` — each page's primary read or write on pos-tenant. */
export const PLATFORM_PAGE = {
  tenantRead: ['platform:tenant:read'],
  tenantCreate: ['platform:tenant:create'],
} as const satisfies Record<string, readonly string[]>;

/**
 * `/app/platform` — the tenant registry (ADR-0062 §7). Held only by the platform
 * tenant's role template (`PLATFORM_ADMIN`); never granted to a tenant role.
 *
 * The union of the pages' own gates, not the whole `platform:` domain: a
 * session is admitted when it can open at least one page here, and the
 * group's empty path then lands on the first child it can open (the list for
 * a reader, the create form for a create-only session; see
 * `PLATFORM_ROUTES`). Account codes admit nothing on their own — there is no
 * account page yet.
 */
export const PLATFORM_PERMISSIONS: readonly string[] = [
  ...PLATFORM_PAGE.tenantRead,
  ...PLATFORM_PAGE.tenantCreate,
];

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

/**
 * `/app/people` — employees, RBAC, timekeeping, the people directory.
 * The trailing codes are what its own cross-domain pages are gated on: the two
 * timekeeping reports (served by pos-accounting) and the people bulk import.
 */
export const PEOPLE_PERMISSIONS = permissionsInDomains(
  'people:',
  'people-contact:',
  'timekeeping:',
  'TimeEntry:',
  'accounting:export:view',
  'accounting:time:export',
  'bulkImport:upload:execute',
);

/**
 * `/app/location` — sites, bays, mobile units, storage locations.
 * The trailing codes are what its own cross-domain pages are gated on: the
 * inventory location-sync console and the location bulk import.
 */
export const LOCATION_PERMISSIONS = permissionsInDomains(
  'location:',
  'inventory:location:view',
  'bulkImport:upload:execute',
);

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
  /**
   * `consume-picked-items` (fulfillment) is the one inventory-hosted page whose
   * write endpoint is enforced by pos-workorder, not pos-inventory:
   * `WorkorderPickedItemsController.consumeWorkorderPickedItems` is
   * `@PreAuthorize('workorder:parts:consume')`, not an `inventory:pick_list:*`
   * code (verified against pos-workorder; see INVENTORY_PAGE.consumeItems and
   * issue #347 group 5). Full code, not a prefix — no other workexec page lives
   * under /app/inventory.
   */
  'workorder:parts:consume',
);

/**
 * `/app/product` — catalog, pricing, product lifecycle, and the availability/feed views.
 * The trailing codes are what its own cross-domain pages are gated on: the
 * inventory availability view, the location roster, and the two bulk imports.
 */
export const PRODUCT_PERMISSIONS = permissionsInDomains(
  'catalog:',
  'pricing:',
  'product:',
  'inventory:availability:read',
  'location:read',
  'bulkImport:upload:execute',
);

/** `/app/order` — carts, order lines, price overrides, returns. */
export const ORDER_PERMISSIONS = permissionsInDomains('order:');

/**
 * `/app/shopmgmt` — shop dashboard, dispatch board, schedule, appointments, mechanics.
 * The trailing codes are what its own cross-domain pages are gated on: both
 * boards render pos-workorder's dashboard, and mechanic availability is a
 * pos-people read.
 */
export const SHOPMGMT_PERMISSIONS = permissionsInDomains(
  'shop:',
  'appointments:',
  'workorder:dashboard:view',
  'people:availability:view',
);

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
  /**
   * Route/landing-nav admission for `putaway-execute` (and the task list). The
   * page's own load — `getPutawayTasks`, unconditional in the constructor — is
   * `@PreAuthorize('inventory:putaway:view')` on `PutawayTaskController`, so the
   * view code alone is sufficient to reach the page.
   *
   * Not the write gate — use `putawayExecute` below for `completePutaway` and
   * its submit control (Copilot #4105526174, ADR-0040 §6a.1).
   */
  putaway: ['inventory:putaway:view'],
  /**
   * `completePutaway` is a write — `PutawayExecuteController.executePutaway` is
   * `@PreAuthorize('inventory:putaway:execute')` — so the submit control and the
   * method body both gate on this code independently, not the `putaway` view
   * admission above (ADR-0040 §6a.1). This write-only set stays exactly what
   * `PutawayExecuteComponent.canExecute` and its component/method tests check.
   */
  putawayExecute: ['inventory:putaway:execute'],
  /** `listReplenishmentTasks` is gated on the plain inventory view authority. */
  replenishment: ['inventory:on_hand:view'],
  cycleCount: ['inventory:cycle_count:view'],
  /**
   * The plan form cannot be used without its location picker: the form loads
   * `listInventoryLocations` on entry and `locationId` is required to submit, so
   * both authorities are needed. Declared on the route as `allPermissions`
   * (AND), which denies before render rather than letting the page load and 403
   * on its only data fetch (issue #258).
   */
  cycleCountPlanCreate: ['inventory:cycle_count:initiate', 'inventory:location:view'],
  /** `listCycleCountAdjustments` uses `hasAnyAuthority` over both codes. */
  adjustments: ['inventory:adjustment:view', 'inventory:adjustment:approve'],
  pickList: ['inventory:pick_list:view'],
  /**
   * `pick-execute` exists to write (scan-resolve/confirm/complete on
   * `WorkorderPickFacadeController`, each `@PreAuthorize('inventory:pick_list:execute')`),
   * so every mutation surface and its method body gate on this write code, not
   * the `pickList` view (ADR-0040 §6a.1). Fixes issue #347 group 5: a mechanic
   * reaching this page previously needed `inventory:pick_list:view` only, the
   * same read authority as the list page.
   *
   * Not the route/landing-nav gate — use `pickExecuteAccess` for those. This
   * write-only set stays exactly what `PickExecutePageComponent.canExecute` and
   * its component/method tests check.
   */
  pickExecute: ['inventory:pick_list:execute'],
  /**
   * Route/landing-nav admission for `pick-execute`, distinct from `pickExecute`
   * above. `getWorkorderPickList` and `getPickTasks` — the reads the page's
   * constructor fires unconditionally — are each `@PreAuthorize('inventory:pick_list:view')`
   * on `WorkorderPickFacadeController`, with no `execute` fallback, so a session
   * admitted on the write alone still 403s before it can pick. AND both
   * authorities here, mirroring `cycleCountPlanCreate`: deny before render
   * rather than let the page load and 403 on its own first read (issue #258
   * pattern; found again for this page in PR #364 review). Declared on the
   * route as `allPermissions`, never folded into `pickExecute`, so the write
   * controls keep gating on the write code alone.
   */
  pickExecuteAccess: ['inventory:pick_list:view', 'inventory:pick_list:execute'],
  /**
   * `consume-picked-items` exists to write. Its actual backend enforcement is
   * `WorkorderPickedItemsController.consumeWorkorderPickedItems` →
   * `@PreAuthorize('workorder:parts:consume')` — a workexec-domain code, not
   * `inventory:pick_list:execute` — so every mutation surface and its method
   * body gate on that, matching what the endpoint enforces (ADR-0040 §6a.1).
   *
   * Not the route/landing-nav gate — use `consumeItemsAccess` for that. This
   * write-only set stays exactly what `ConsumePickedItemsPageComponent`'s
   * submit gate and its component/method tests check.
   */
  consumeItems: ['workorder:parts:consume'],
  /**
   * Route/landing-nav admission for `consume-items`, distinct from
   * `consumeItems` above. Its own read, `getPickedItems`, is
   * `@PreAuthorize('inventory:pick_list:view')` on `WorkorderPickedItemsController`
   * — same gap as `pickExecuteAccess` above: a write-only session is admitted
   * by the route but 403s on the page's own first read. AND both authorities
   * here so the route denies before render instead (issue #258 pattern).
   * Declared as `allPermissions`, never folded into `consumeItems`, so the
   * write control keeps gating on `workorder:parts:consume` alone.
   */
  consumeItemsAccess: ['inventory:pick_list:view', 'workorder:parts:consume'],
  returnToStock: ['inventory:return:view'],
  /**
   * `submitReturnToStock` is a write — `ReturnController.submitToStock` is
   * `@PreAuthorize('inventory:return:write')` — so the submit control and the
   * method body both gate on this code independently, not the `returnToStock`
   * view admission above (ADR-0040 §6a.1).
   */
  returnToStockWrite: ['inventory:return:write'],
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
  /** `listAccountingPeriods`. Closing and reopening are gated by {@link ACCOUNTING_SECTION}. */
  periodClose: ['accounting:period:view'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Write controls *inside* an accounting page, as opposed to the page gate in
 * {@link ACCOUNTING_PAGE}. The period-close page admits anyone holding
 * `accounting:period:view`, but `closeAccountingPeriod` enforces
 * `accounting:period:close` and `reopenAccountingPeriod` enforces
 * `accounting:period:reopen`, so each control and its handler gate on its own
 * code (ADR-0040 §6a).
 */
export const ACCOUNTING_SECTION = {
  periodClose: ['accounting:period:close'],
  periodReopen: ['accounting:period:reopen'],
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

/**
 * Permissions for individual *sections* of a CRM page, as opposed to the page
 * gate in {@link CRM_PAGE}. The party detail page admits anyone holding
 * `crm:party:view`, but two of its panels read narrower resources, so without
 * these a permitted visitor still fires requests that can only ever 403
 * (issue #255).
 *
 * `partyContacts` is the same authority the sibling `/party/:partyId/contacts`
 * route declares, for the same `getCommercialAccountContacts` endpoint.
 * `communicationPreferences` follows the domain's `domain:resource:action`
 * convention; the generated CRM API reference documents the 403 on that
 * endpoint without naming the authority, so callers should treat a missing
 * section permission as advisory and keep handling a 403 reactively.
 */
export const CRM_SECTION = {
  partyContacts: CRM_PAGE.partyContacts,
  communicationPreferences: ['crm:contact_preference:view'],
  person: ['crm:person:read'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/workexec/*` — estimates, approvals, work orders, labor, parts. */
export const WORKEXEC_PAGE = {
  travelTime: ['workorder:labor:add'],
  estimateCreate: ['workorder:estimate:create'],
  /** `getEstimateById` fronts the detail, list, parts, labor and summary pages. */
  estimateView: ['workorder:estimate:view'],
  /** Revise reopens a closed estimate before copying it. */
  estimateRevise: ['workorder:estimate:reopen'],
  estimateSubmit: ['workorder:estimate:submit'],
  estimateApprove: ['workorder:estimate:approve'],
  laborView: ['workorder:labor:view'],
  wip: ['workorder:wip:view'],
  workorderView: ['workorder:workorder:view'],
  workorderAssign: ['workorder:workorder:assign-technician'],
  /**
   * `assignServicePosition` / `releaseServicePosition` — placing a workorder on
   * a bay, a mobile unit or the site's HOLD, or taking it off.
   *
   * Both endpoints bind to `workorder:position:assign`
   * (durion-positivity-backend#2059), not to shop management's
   * `shop:bay:assign`, which governs appointment dispatch in pos-shop-manager.
   *
   * They required `workorder:operationalContext:override` until #2059, which is
   * why a dispatcher could hand a job to a technician but not put it in a bay:
   * that code gates the manager exception path, which also rewrites a
   * workorder's mechanics and location, and it is no longer accepted here.
   */
  positionAssign: ['workorder:position:assign'],
  partsView: ['workorder:parts:view'],
  changeRequests: ['workorder:change_request:view'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/shopmgmt/*` — dispatch, schedule, appointments, mechanics. */
export const SHOPMGMT_PAGE = {
  /** Both boards render `getDashboard`, which pos-workorder owns. */
  dashboard: ['workorder:dashboard:view'],
  schedule: ['shop:schedule:view'],
  /** `createAppointment` uses `hasAnyAuthority` over both codes. */
  appointmentCreate: ['appointments:create', 'shop:schedule:edit'],
  appointmentView: ['appointments:view', 'shop:schedule:view'],
  appointmentReschedule: ['appointments:reschedule'],
  /** `cancelAppointment` — a separate write authority from reschedule (durion-positivity-backend). */
  appointmentCancel: ['appointments:cancel'],
  /**
   * The page carries the reschedule form (its own codes) and the CAP-326 D18.3 override, which
   * the backend gates on `shop:conflict:override` alone; the page is reachable by either, and
   * the override action itself is shown only to holders of `conflictOverride` below.
   */
  appointmentOverride: ['shop:schedule:edit', 'appointments:reschedule', 'shop:conflict:override'],
  /** `executeConflictOverride` — `shop:conflict:override`, the sole authority (DECISION-SHOPMGMT-002). */
  conflictOverride: ['shop:conflict:override'],
  bayAssign: ['shop:bay:assign'],
  /** Availability is a pos-people read. */
  mechanicAvailability: ['people:availability:view'],
  mechanicRoster: ['shop:technician:view'],
  /**
   * Clocking a mechanic in or out from the dispatch board
   * (`startWorkSession` / `stopWorkSession` in pos-people).
   *
   * pos-people admits the session's own person *or* a
   * `people:timekeeping:approve` holder, location-scoped
   * (durion-positivity-backend#2061 closed the earlier gap, where both
   * endpoints were gated on `isAuthenticated()` alone). This board clocks other
   * people, so it asks for the grant; the self case belongs to a self-service
   * view, not to a dispatcher's board.
   *
   * Reading the state is a different, lesser authority — `people:timekeeping:view`,
   * which the availability endpoint applies per row by nulling `clockState`
   * rather than refusing the read, so the board needs no gate of its own for it.
   */
  mechanicClock: ['people:timekeeping:approve'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/product/*` — catalog, pricing, enrichment, and the views it borrows. */
export const PRODUCT_PAGE = {
  catalog: ['catalog:product:view'],
  treadDesign: ['catalog:tread_design:view'],
  priceBooks: ['catalog:price_book:read'],
  msrp: ['catalog:msrp:read'],
  locationOverrides: ['catalog:location_price_override:read'],
  /** Availability and the location roster are inventory/location reads. */
  availability: ['inventory:availability:read'],
  locationsRoster: ['location:read'],
  bulkImport: ['bulkImport:upload:execute'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/people/*` — directory, employees, RBAC, timekeeping. */
export const PEOPLE_PAGE = {
  directory: ['people-contact:person:view'],
  /**
   * The person profile (`/app/people/person/:personId`) — the identity record every
   * directory row links to, employee or not. Its reads (`getPeopleByIds`,
   * `getPersonPostalAddress`) are guarded by `people-contact:person:view` in pos-people-contact.
   */
  personDetail: ['people-contact:person:view'],
  /**
   * The employee register (`/app/people/employees`). `searchEmployees` in pos-people is
   * guarded by `people:employee:view`, so the page gate is that same code. The register's
   * PII columns, role column and status switch are gated separately inside the page —
   * see ADR-0040 §6a and the `PEOPLE_SECTION` entries below.
   */
  employeeRegister: ['people:employee:view'],
  roleAssignment: ['people-contact:role:view'],
  timeApproval: ['people:timekeeping:view'],
  /** Pay-period admin: the list is `listTimePeriods`, the same read the approval page uses. */
  payPeriods: ['people:timekeeping:view'],
  /** Both timekeeping reports are served by pos-accounting. */
  timeExport: ['accounting:export:view'],
  discrepancyReport: ['accounting:time:export'],
  employeeCreate: ['people:employee:create'],
  /** `getEmployee` reads PII, so the profile page needs the PII bit, not `people:employee:view`. */
  employeeDetail: ['people:employee_pii:view'],
  employeeOffboard: ['people:employee:activation'],
  locationAssignments: ['people:employee:view'],
  identityCompliance: ['people:compliance:view'],
  bulkImport: ['bulkImport:upload:execute'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Permissions for individual *sections* of a People page, as opposed to the page
 * gate in `PEOPLE_PAGE`. The RBAC page is gated on `people-contact:role:view`,
 * which says nothing about the identity directory, so its header lookup is
 * gated separately rather than firing a request that can only 403 (issue #255's
 * failure mode, avoided here for the label added by issue #257).
 *
 * `personLookup` is the same authority `PEOPLE_PAGE.directory` declares: both
 * read the identity directory through `PeopleAPIService` in pos-people-contact.
 * Note the neighbouring `people:person:view` in the catalog belongs to pos-people
 * and does not govern this SDK's reads.
 */
export const PEOPLE_SECTION = {
  personLookup: PEOPLE_PAGE.directory,
  /**
   * Person profile writes: `updatePerson`, `replaceContactPoints`, and the person
   * postal-address put/delete all require `people-contact:person:edit`.
   */
  personEdit: ['people-contact:person:edit'],
  /**
   * Employee register column and control gates. Each is the authority the destination
   * route already declares, so a rendered link can never lead to a 403:
   * `registerPii` mirrors `employeeDetail`, `registerRoles` mirrors `roleAssignment`,
   * `registerTime` mirrors `timeApproval`, `registerDeactivate` mirrors `employeeOffboard`.
   */
  registerPii: PEOPLE_PAGE.employeeDetail,
  registerRoles: PEOPLE_PAGE.roleAssignment,
  registerTime: PEOPLE_PAGE.timeApproval,
  registerLocations: PEOPLE_PAGE.locationAssignments,
  registerDeactivate: PEOPLE_PAGE.employeeOffboard,
  registerCreate: PEOPLE_PAGE.employeeCreate,
  /**
   * Time approval decisions. The page gate is only `people:timekeeping:view`; the period
   * approve/reject writes need their own authorities in pos-people.
   */
  timeApprove: ['people:timekeeping:approve'],
  timeReject: ['people:timekeeping:reject'],
  /** Pay-period admin controls: `createTimePeriod` and `transitionTimePeriod` in pos-people. */
  payPeriodCreate: ['people:timePeriod:create'],
  payPeriodTransition: ['people:timePeriod:transition'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/location/*` — sites, bays, mobile units, storage locations. */
export const LOCATION_PAGE = {
  locationView: ['location:read'],
  locationCreate: ['location:write'],
  bays: ['location:bay:read'],
  /** Bays page write controls: create and edit. pos-location can also scope this to one location (403). */
  bayManage: ['location:bay:manage'],
  /** Bays page specialty-service search (pos-catalog service search). */
  catalogServiceView: ['catalog:service_type:view'],
  mobileUnits: ['location:mobile-unit:read'],
  /** The sync console reads pos-inventory's replicated location tree. */
  sync: ['inventory:location:view'],
  bulkImport: ['bulkImport:upload:execute'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/billing/*` — only the invoice read is permissioned; see the spec's exclusions. */
export const BILLING_PAGE = {
  invoiceView: ['invoice:invoice:view'],
} as const satisfies Record<string, readonly string[]>;

/**
 * `/app/billing` write controls.
 *
 * durion-positivity-backend#2226 (catalog v92) registered the codes that were missing when this
 * gate was first removed (PR #383, Copilot #4106105951/#4106105999/#4106194893/#4106194936): the
 * catalog now decodes `invoice:payment:refund`, `invoice:payment:void`, `invoice:receipt:generate`,
 * `invoice:receipt:reprint_override` and `invoice:payment:override` (bits 536–541, `permission-catalog.ts`
 * regenerated from backend origin/main). `PaymentReversalServiceImpl`/`ReceiptServiceImpl` still
 * enforce these via `SecurityContextHelper.hasAuthority(...)` in the service body rather than
 * `@PreAuthorize`, so the *codes* are real but a page gate here can only ever be a client-side
 * hint — the backend remains authoritative and a 403 is still mapped to a localized error by the
 * calling page (`PaymentVoidRefundPageComponent.executeVoid`/`executeRefund`,
 * `ReceiptPageComponent.generateAndShow`/`reprint`).
 *
 * Each control is gated independently of its method call (ADR-0040 §6a pattern, mirrored from
 * `INVENTORY_PAGE.pickExecute`'s `canExecute`): a page computes
 * `!auth.permissionsKnown() || auth.hasAnyPermission(BILLING_SECTION.xExecute)` to decide whether to
 * *disable* the button, and the mutation method (`executeVoid`/`executeRefund`,
 * `generateAndShow`/`reprint`) re-checks that same computed at the top of its body before any state
 * change or transport call — so a denied caller invoking the method directly (bypassing the
 * disabled control) is refused client-side too, not just left to a 403. The backend enforces these
 * authorities regardless of what this client-side gate decides (ADR-0040 §6a.2), and a 403 that
 * does slip through — a race, a stale permission claim — is still mapped to a localized error by
 * the calling page. A legacy token without a `perm_bits` claim (`permissionsKnown() === false`) is
 * treated as granted, exactly like `AuthService.canAccess()`, so it never locks out a session the
 * backend would still admit.
 *
 * `receiptReprintOverride` is wired only where the page can actually know it applies:
 * `ReceiptServiceImpl.reprintReceipt` requires it once `ReceiptViewResponse.reprintCount >= 5`
 * (verified against backend origin/main), a count the page now has from `ReceiptService.getReceipt`
 * (durion-positivity-backend#2214) — see `ReceiptPageComponent.canReprintPastCap`.
 *
 * `paymentOverride` backs a second, unrelated elevation: `PaymentReversalServiceImpl` requires it
 * only after the void (24h) or refund (180d) window has elapsed since the payment intent was
 * authorized/captured. Declared here for the catalog's sake; no page pre-warns on it yet because
 * neither `PaymentVoidRefundPageComponent` mode reliably has the *authorization* timestamp today
 * (`getInvoicePayment`'s `createdAt` is the payment intent's own creation, not necessarily the
 * capture/authorization instant) — wire a pre-warn once that's confirmed against the entity.
 */
export const BILLING_SECTION = {
  refundExecute: ['invoice:payment:refund'],
  voidExecute: ['invoice:payment:void'],
  receiptGenerate: ['invoice:receipt:generate'],
  receiptReprintOverride: ['invoice:receipt:reprint_override'],
  paymentOverride: ['invoice:payment:override'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/order/*` — carts, lines, price overrides, cancellation. */
export const ORDER_PAGE = {
  cartCreate: ['order:order:create'],
  cartView: ['order:order:view'],
  priceOverride: ['order:price_override:view'],
  cancel: ['order:order:cancel'],
} as const satisfies Record<string, readonly string[]>;

/**
 * `/app/security/*` — role and permission administration. The group itself is
 * role-gated (`ROLE_ADMIN`); these narrow it to what each page actually reads.
 */
export const SECURITY_PAGE = {
  roles: ['security:role:view'],
  permissions: ['security:permission:view'],
  auditLogs: ['security:audit:view'],
  userProvision: ['security:user:create'],
  /**
   * The "security audit" page calls pos-shop-manager's `/v1/shop/audit`, which
   * is gated on the schedule/appointment reads rather than anything in the
   * security domain. Gating it on `security:audit:view` would refuse the very
   * sessions the endpoint accepts.
   */
  shopAudit: ['shop:schedule:view', 'appointments:view'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Write gates inside Security pages (ADR-0040 §6a). The role page is admitted on
 * `security:role:view`; replacing a role's permission set (`PUT /v1/roles/permissions`,
 * `RoleController`) is enforced on `security:role:edit`, so the controls and methods gate on
 * that separately.
 */
export const SECURITY_SECTION = {
  roleEdit: ['security:role:edit'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/positivity/*` — supplier profiles, exchange audit, manual review. */
export const POSITIVITY_PAGE = {
  profiles: ['supplier:profile:read'],
  exchangeAudit: ['supplier:audit:read'],
  manualReview: ['supplier:transmission:read'],
} as const satisfies Record<string, readonly string[]>;

/** `/app/bulk-import/*` — the job console; both pages are the same status read. */
export const BULK_IMPORT_PAGE = {
  jobs: ['bulkImport:status:read'],
} as const satisfies Record<string, readonly string[]>;

/**
 * The assistant shell — not a route group: the chat modal overlays every `/app`
 * page. Its one mutation is pos-mcp-server's document ingest, and
 * `documentIngest` is the code that endpoint enforces (`permission-catalog.ts`),
 * NOT a role: ROLE_ADMIN gated the control until PR #288, so an admin without
 * the code got a 403 and a non-admin holder of it saw no control at all.
 *
 * Named here, once, because two places gate on it — the control that opens the
 * ingest dialog and the dialog's own `submit()` — and a duplicated literal is how
 * a repointed authority leaves one of them behind (ADR-0040 §6a.1/§6a.6).
 */
export const SHELL_SECTION = {
  documentIngest: ['mcp:document:ingest'],
} as const satisfies Record<string, readonly string[]>;
