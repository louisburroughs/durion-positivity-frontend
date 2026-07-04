/**
 * Static route seeds derived from src/app/app.routes.ts and each feature's
 * *.routes.ts. Seeds guarantee the crawler reaches routes that are not linked
 * from any menu; parameterized routes (":id" etc.) are intentionally omitted —
 * the crawler discovers real instances of those by following links from list
 * pages, which keeps the audit non-destructive and grounded in real data.
 *
 * Keep this list in sync when routes change (grep 'path:' src/app/features/../*.routes.ts).
 */

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
