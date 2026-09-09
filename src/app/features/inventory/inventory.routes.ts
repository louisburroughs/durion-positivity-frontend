import { Routes } from '@angular/router';
import { INVENTORY_PAGE } from '../../core/security/route-permissions';
import { InventoryComponent } from './inventory.component';

/**
 * Pages declare the permission their primary read needs (`INVENTORY_PAGE`), on
 * top of the group gate `/app/inventory` already carries. `rolesChildGuard`
 * runs at every level, so both must pass. See `core/security/route-permissions.ts`
 * for how each code was traced to the backend controller that enforces it.
 */

export const INVENTORY_ROUTES: Routes = [
  {
    path: '',
    component: InventoryComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/landing/inventory-landing-page.component').then(
            m => m.InventoryLandingPageComponent,
          ),
      },
      {
        path: 'by-location',
        data: { permissions: INVENTORY_PAGE.byLocation },
        loadComponent: () =>
          import(
            './pages/by-location/location-overview/location-inventory-overview-page.component'
          ).then(m => m.LocationInventoryOverviewPageComponent),
      },
      {
        path: 'by-location/site/:siteId',
        data: { permissions: INVENTORY_PAGE.byLocation },
        loadComponent: () =>
          import('./pages/by-location/site-tree/site-inventory-tree-page.component').then(
            m => m.SiteInventoryTreePageComponent,
          ),
      },
      {
        path: 'by-location/:locationId',
        data: { permissions: INVENTORY_PAGE.byLocation },
        loadComponent: () =>
          import(
            './pages/by-location/location-overview/location-inventory-overview-page.component'
          ).then(m => m.LocationInventoryOverviewPageComponent),
      },
      {
        path: 'availability',
        data: { permissions: INVENTORY_PAGE.availability },
        loadComponent: () =>
          import('./pages/availability/availability.component').then(
            m => m.AvailabilityComponent,
          ),
      },
      {
        path: 'ledger',
        data: { permissions: INVENTORY_PAGE.ledger },
        loadComponent: () =>
          import('./pages/ledger/ledger-list/ledger-list.component').then(
            m => m.LedgerListComponent,
          ),
      },
      {
        path: 'ledger/:ledgerEntryId',
        data: { permissions: INVENTORY_PAGE.ledger },
        loadComponent: () =>
          import('./pages/ledger/ledger-detail/ledger-detail.component').then(
            m => m.LedgerDetailComponent,
          ),
      },
      {
        path: 'receiving/receive-into-staging',
        data: { permissions: INVENTORY_PAGE.receiving },
        loadComponent: () =>
          import(
            './pages/receiving/receive-into-staging/receive-into-staging.component'
          ).then(m => m.ReceiveIntoStagingComponent),
      },
      {
        path: 'putaway/tasks',
        data: { permissions: INVENTORY_PAGE.putaway },
        loadComponent: () =>
          import('./pages/putaway/putaway-task-list/putaway-task-list.component').then(
            m => m.PutawayTaskListComponent,
          ),
      },
      {
        path: 'putaway/tasks/:taskId',
        data: { permissions: INVENTORY_PAGE.putaway },
        loadComponent: () =>
          import('./pages/putaway/putaway-execute/putaway-execute.component').then(
            m => m.PutawayExecuteComponent,
          ),
      },
      {
        path: 'replenishment/tasks',
        data: { permissions: INVENTORY_PAGE.replenishment },
        loadComponent: () =>
          import(
            './pages/replenishment/replenishment-task-list/replenishment-task-list.component'
          ).then(m => m.ReplenishmentTaskListComponent),
      },
      {
        path: 'counts/execute',
        data: { permissions: INVENTORY_PAGE.cycleCount },
        loadComponent: () =>
          import('./pages/counts/count-execute/count-execute.component').then(
            m => m.CountExecuteComponent,
          ),
      },
      {
        path: 'counts/adjustments',
        data: { permissions: INVENTORY_PAGE.adjustments },
        loadComponent: () =>
          import(
            './pages/counts/adjustment-approvals/adjustment-approvals.component'
          ).then(m => m.AdjustmentApprovalsComponent),
      },
      {
        path: 'counts/plans',
        data: { permissions: INVENTORY_PAGE.cycleCount },
        loadComponent: () =>
          import('./pages/counts/cycle-count-plan-list/cycle-count-plan-list-page.component').then(
            m => m.CycleCountPlanListPageComponent,
          ),
      },
      {
        path: 'counts/plans/new',
        data: { permissions: INVENTORY_PAGE.cycleCountPlanCreate },
        loadComponent: () =>
          import('./pages/counts/cycle-count-plan-form/cycle-count-plan-form-page.component').then(
            m => m.CycleCountPlanFormPageComponent,
          ),
      },
      {
        path: 'purchase-orders',
        data: { permissions: INVENTORY_PAGE.purchaseOrderView },
        loadComponent: () =>
          import('./pages/purchase-orders/po-list/po-list.component').then(
            m => m.PoListComponent,
          ),
      },
      {
        path: 'receiving/cross-dock',
        data: { allPermissions: INVENTORY_PAGE.receivingCrossDock },
        loadComponent: () =>
          import('./pages/receiving/cross-dock-receive/cross-dock-receive-page.component').then(
            m => m.CrossDockReceivePageComponent,
          ),
      },
      {
        path: 'purchase-orders/new',
        data: { permissions: INVENTORY_PAGE.purchaseOrderEdit },
        loadComponent: () =>
          import('./pages/purchase-orders/po-form/po-form.component').then(
            m => m.PoFormComponent,
          ),
      },
      {
        path: 'purchase-orders/:poId',
        data: { permissions: INVENTORY_PAGE.purchaseOrderView },
        loadComponent: () =>
          import('./pages/purchase-orders/po-detail/po-detail.component').then(
            m => m.PoDetailComponent,
          ),
      },
      {
        path: 'purchase-orders/:poId/edit',
        data: { permissions: INVENTORY_PAGE.purchaseOrderEdit },
        loadComponent: () =>
          import('./pages/purchase-orders/po-form/po-form.component').then(
            m => m.PoFormComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/pick-list',
        data: { permissions: INVENTORY_PAGE.pickList },
        loadComponent: () =>
          import('./pages/fulfillment/pick-list/pick-list-page.component').then(
            m => m.PickListPageComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/return-to-stock',
        data: { permissions: INVENTORY_PAGE.returnToStock },
        loadComponent: () =>
          import('./pages/fulfillment/return-to-stock/return-to-stock-page.component').then(
            m => m.ReturnToStockPageComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/consume-items',
        data: { permissions: INVENTORY_PAGE.pickList },
        loadComponent: () =>
          import('./pages/fulfillment/consume-picked-items/consume-picked-items-page.component').then(
            m => m.ConsumePickedItemsPageComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/pick-execute',
        data: { permissions: INVENTORY_PAGE.pickList },
        loadComponent: () =>
          import('./pages/fulfillment/pick-execute/pick-execute-page.component').then(
            m => m.PickExecutePageComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/shortage-resolution',
        data: { permissions: INVENTORY_PAGE.shortageResolution },
        loadComponent: () =>
          import('./pages/fulfillment/shortage-resolution/shortage-resolution-page.component').then(
            m => m.ShortageResolutionPageComponent,
          ),
      },
      {
        path: 'security/permissions',
        data: { permissions: INVENTORY_PAGE.securityAdmin },
        loadComponent: () =>
          import('./pages/security/inventory-security-admin/inventory-security-admin-page.component').then(
            m => m.InventorySecurityAdminPageComponent,
          ),
      },
      {
        path: 'bulk-import/stock',
        data: { permissions: INVENTORY_PAGE.bulkImport },
        loadComponent: () =>
          import('./pages/bulk-import/inventory-bulk-import-page.component').then(
            m => m.InventoryBulkImportPageComponent,
          ),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];

