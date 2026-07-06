/**
 * Static route seeds derived from src/app/app.routes.ts and each feature's
 * *.routes.ts. Seeds guarantee the crawler reaches routes that are not linked
 * from any menu; parameterized routes (":id" etc.) are intentionally omitted —
 * the crawler discovers real instances of those by following links from list
 * pages, which keeps the audit non-destructive and grounded in real data.
 *
 * Keep this list in sync when routes change (grep 'path:' src/app/features/../*.routes.ts).
 */

import type { ParamRouteTemplate } from './id-harvest';

/** Routes reachable without authentication. */
export const PUBLIC_SEEDS: readonly string[] = ['/', '/login', '/forbidden', '/not-found'];

/** Routes behind authGuard (crawled only when credentials are supplied). */
export const APP_SEEDS: readonly string[] = [
  '/app',
  '/app/admin',

  // CRM
  '/app/crm',
  '/app/crm/customers',
  '/app/crm/create-commercial-account',
  '/app/crm/create-individual-person',
  '/app/crm/merge-parties',
  '/app/crm/snapshot',
  '/app/crm/integration/events',
  '/app/crm/bulk-import/customer',
  '/app/crm/bulk-import/vehicle-inventory',
  '/app/crm/bulk-import/vehicle-fitment',

  // Work execution
  '/app/workexec',
  '/app/workexec/travel-time',
  '/app/workexec/workorders/from-appointment',
  '/app/workexec/estimates/new',
  '/app/workexec/estimate-list',
  '/app/workexec/timer',
  '/app/workexec/wip-status',

  // Accounting
  '/app/accounting',
  '/app/accounting/events',
  '/app/accounting/events/contract',
  '/app/accounting/events/submit',
  '/app/accounting/events/failed',
  '/app/accounting/posting-rules',
  '/app/accounting/payments/apply',
  '/app/accounting/credit-memos',
  '/app/accounting/credit-memos/new',
  '/app/accounting/vendor-payments',
  '/app/accounting/vendor-payments/new',
  '/app/accounting/reports/labor-overhead',

  // Billing
  '/app/billing',

  // People / HR
  '/app/people',
  '/app/people/directory',
  '/app/people/employees/new',
  '/app/people/timekeeping/approval',
  '/app/people/timekeeping/work-session',
  '/app/people/timekeeping/export',
  '/app/people/timekeeping/discrepancy',
  '/app/people/bulk-import/people',

  // Location
  '/app/location',
  '/app/location/locations',
  '/app/location/locations/new',
  '/app/location/bays',
  '/app/location/mobile-units',
  '/app/location/storage-locations',
  '/app/location/location-sync',
  '/app/location/bulk-import/location',

  // Inventory
  '/app/inventory',
  '/app/inventory/by-location',
  '/app/inventory/availability',
  '/app/inventory/ledger',
  '/app/inventory/receiving/receive-into-staging',
  '/app/inventory/receiving/cross-dock',
  '/app/inventory/putaway/tasks',
  '/app/inventory/replenishment/tasks',
  '/app/inventory/counts/execute',
  '/app/inventory/counts/adjustments',
  '/app/inventory/counts/plans',
  '/app/inventory/counts/plans/new',
  '/app/inventory/purchase-orders',
  '/app/inventory/purchase-orders/new',
  '/app/inventory/security/permissions',
  '/app/inventory/bulk-import/stock',

  // Product
  '/app/product',
  '/app/product/catalog',
  '/app/product/pricing/price-books',
  '/app/product/pricing/msrp',
  '/app/product/pricing/location-overrides',
  '/app/product/inventory/availability',
  '/app/product/inventory/feeds',
  '/app/product/location/locations-roster',
  '/app/product/bulk-import/catalog',
  '/app/product/bulk-import/price',

  // Order
  '/app/order/cart',

  // Security (ROLE_ADMIN)
  '/app/security',
  '/app/security/permissions',
  '/app/security/audit',
  '/app/security/identity-compliance',
  '/app/security/audit-logs',
  '/app/security/users/provision',

  // Shop management
  '/app/shopmgmt',
  '/app/shopmgmt/dispatch-board',
  '/app/shopmgmt/schedule',
  '/app/shopmgmt/appointments/new',
  '/app/shopmgmt/appointments/new/crm',
  '/app/shopmgmt/mechanics/availability',
  '/app/shopmgmt/mechanics/roster',

  // Bulk import
  '/app/bulk-import/jobs',
];

/**
 * Parameterized routes filled with real entity ids harvested from the API
 * responses the crawled pages already made (see id-harvest.ts). Read-only:
 * every generated visit is still a plain GET navigation.
 *
 * Deliberately excluded (their whole purpose is a mutation flow, so we do not
 * auto-visit them even though rendering is safe): order cancel/price-override,
 * estimate approval submit/revise, workorder finalize/assign/invoice-finalization,
 * invoice payment-capture/void-refund, employee offboard, appointment
 * reschedule/dispatch-assign/override-conflict, work-session submit,
 * pick-execute/consume-items/return-to-stock/shortage-resolution.
 */
export const PARAM_TEMPLATES: readonly ParamRouteTemplate[] = [
  // Accounting
  { template: '/app/accounting/events/:eventId', params: { eventId: ['eventId', 'accountingEventId'] } },
  { template: '/app/accounting/posting-rules/:ruleSetId', params: { ruleSetId: ['ruleSetId', 'postingRuleSetId'] } },
  { template: '/app/accounting/credit-memos/:memoId', params: { memoId: ['memoId', 'creditMemoId'] } },
  { template: '/app/accounting/vendor-payments/:paymentId', params: { paymentId: ['paymentId', 'vendorPaymentId'] } },
  { template: '/app/accounting/invoices/:invoiceId/payment-status', params: { invoiceId: ['invoiceId'] } },

  // Billing
  { template: '/app/billing/invoices/:invoiceId', params: { invoiceId: ['invoiceId'] } },
  { template: '/app/billing/invoices/:invoiceId/receipts', params: { invoiceId: ['invoiceId'] } },

  // Bulk import
  { template: '/app/bulk-import/jobs/:jobId', params: { jobId: ['jobId', 'importJobId'] } },

  // CRM
  { template: '/app/crm/party/:partyId', params: { partyId: ['partyId'] } },
  { template: '/app/crm/party/:partyId/contacts', params: { partyId: ['partyId'] } },
  { template: '/app/crm/party/:partyId/billing-rules', params: { partyId: ['partyId'] } },
  { template: '/app/crm/crm-snapshot/:partyId', params: { partyId: ['partyId'] } },

  // Inventory
  { template: '/app/inventory/by-location/site/:siteId', params: { siteId: ['siteId'] } },
  { template: '/app/inventory/by-location/:locationId', params: { locationId: ['locationId'] } },
  { template: '/app/inventory/ledger/:ledgerEntryId', params: { ledgerEntryId: ['ledgerEntryId', 'entryId'] } },
  { template: '/app/inventory/putaway/tasks/:taskId', params: { taskId: ['taskId', 'putawayTaskId'] } },
  { template: '/app/inventory/purchase-orders/:poId', params: { poId: ['poId', 'purchaseOrderId'] } },
  { template: '/app/inventory/fulfillment/workorders/:workorderId/pick-list', params: { workorderId: ['workorderId', 'workOrderId'] } },

  // Location — the location SDK's LocationResponseDTO keys by bare `id`, which
  // the harvester scopes to the API resource ('id@locations'); 'locationId'
  // still matches other domains' FK fields.
  { template: '/app/location/locations/:id', params: { id: ['locationId', 'id@locations'] } },
  { template: '/app/location/locations/:locationId/defaults', params: { locationId: ['locationId', 'id@locations'] } },

  // Order
  { template: '/app/order/cart/:orderId', params: { orderId: ['orderId'] } },

  // People
  { template: '/app/people/employees/:id', params: { id: ['personId', 'employeeId'] } },
  { template: '/app/people/rbac/:personUuid', params: { personUuid: ['personUuid', 'personId'] } },
  { template: '/app/people/person/:personId/locations', params: { personId: ['personId'] } },

  // Product
  { template: '/app/product/catalog/:productId', params: { productId: ['productId'] } },

  // Shop management
  { template: '/app/shopmgmt/appointments/:id/edit', params: { id: ['appointmentId'] } },
  { template: '/app/shopmgmt/appointments/:id/assignments', params: { id: ['appointmentId'] } },

  // Work execution
  { template: '/app/workexec/estimates/:estimateId', params: { estimateId: ['estimateId'] } },
  { template: '/app/workexec/estimates/:estimateId/parts', params: { estimateId: ['estimateId'] } },
  { template: '/app/workexec/estimates/:estimateId/labor', params: { estimateId: ['estimateId'] } },
  { template: '/app/workexec/estimates/:estimateId/summary', params: { estimateId: ['estimateId'] } },
  { template: '/app/workexec/workorders/:workorderId', params: { workorderId: ['workorderId', 'workOrderId'] } },
  { template: '/app/workexec/workorders/:workorderId/labor', params: { workorderId: ['workorderId', 'workOrderId'] } },
  { template: '/app/workexec/workorders/:workorderId/parts', params: { workorderId: ['workorderId', 'workOrderId'] } },
  { template: '/app/workexec/workorders/:id/operational-context', params: { id: ['workorderId', 'workOrderId'] } },
];
