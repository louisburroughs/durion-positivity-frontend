import { Routes } from '@angular/router';
import { InventoryComponent } from './inventory.component';

export const INVENTORY_ROUTES: Routes = [
  {
    path: '',
    component: InventoryComponent,
    children: [
      { path: '', redirectTo: 'availability', pathMatch: 'full' },
      {
        path: 'availability',
        loadComponent: () =>
          import('./pages/availability/availability.component').then(
            m => m.AvailabilityComponent,
          ),
      },
      {
        path: 'ledger',
        loadComponent: () =>
          import('./pages/ledger/ledger-list/ledger-list.component').then(
            m => m.LedgerListComponent,
          ),
      },
      {
        path: 'ledger/:ledgerEntryId',
        loadComponent: () =>
          import('./pages/ledger/ledger-detail/ledger-detail.component').then(
            m => m.LedgerDetailComponent,
          ),
      },
      {
        path: 'receiving/receive-into-staging',
        loadComponent: () =>
          import(
            './pages/receiving/receive-into-staging/receive-into-staging.component'
          ).then(m => m.ReceiveIntoStagingComponent),
      },
      {
        path: 'putaway/tasks',
        loadComponent: () =>
          import('./pages/putaway/putaway-task-list/putaway-task-list.component').then(
            m => m.PutawayTaskListComponent,
          ),
      },
      {
        path: 'putaway/tasks/:taskId',
        loadComponent: () =>
          import('./pages/putaway/putaway-execute/putaway-execute.component').then(
            m => m.PutawayExecuteComponent,
          ),
      },
      {
        path: 'replenishment/tasks',
        loadComponent: () =>
          import(
            './pages/replenishment/replenishment-task-list/replenishment-task-list.component'
          ).then(m => m.ReplenishmentTaskListComponent),
      },
      {
        path: 'counts/execute',
        loadComponent: () =>
          import('./pages/counts/count-execute/count-execute.component').then(
            m => m.CountExecuteComponent,
          ),
      },
      {
        path: 'counts/adjustments',
        loadComponent: () =>
          import(
            './pages/counts/adjustment-approvals/adjustment-approvals.component'
          ).then(m => m.AdjustmentApprovalsComponent),
      },
      {
        path: 'counts/plans',
        loadComponent: () =>
          import('./pages/counts/cycle-count-plan-list/cycle-count-plan-list-page.component').then(
            m => m.CycleCountPlanListPageComponent,
          ),
      },
      {
        path: 'counts/plans/new',
        loadComponent: () =>
          import('./pages/counts/cycle-count-plan-form/cycle-count-plan-form-page.component').then(
            m => m.CycleCountPlanFormPageComponent,
          ),
      },
      {
        path: 'purchase-orders',
        loadComponent: () =>
          import('./pages/purchase-orders/po-list/po-list.component').then(
            m => m.PoListComponent,
          ),
      },
      {
        path: 'receiving/cross-dock',
        loadComponent: () =>
          import('./pages/receiving/cross-dock-receive/cross-dock-receive-page.component').then(
            m => m.CrossDockReceivePageComponent,
          ),
      },
      {
        path: 'purchase-orders/new',
        loadComponent: () =>
          import('./pages/purchase-orders/po-form/po-form.component').then(
            m => m.PoFormComponent,
          ),
      },
      {
        path: 'purchase-orders/:poId',
        loadComponent: () =>
          import('./pages/purchase-orders/po-detail/po-detail.component').then(
            m => m.PoDetailComponent,
          ),
      },
      {
        path: 'purchase-orders/:poId/edit',
        loadComponent: () =>
          import('./pages/purchase-orders/po-form/po-form.component').then(
            m => m.PoFormComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/pick-list',
        loadComponent: () =>
          import('./pages/fulfillment/pick-list/pick-list-page.component').then(
            m => m.PickListPageComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/return-to-stock',
        loadComponent: () =>
          import('./pages/fulfillment/return-to-stock/return-to-stock-page.component').then(
            m => m.ReturnToStockPageComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/consume-items',
        loadComponent: () =>
          import('./pages/fulfillment/consume-picked-items/consume-picked-items-page.component').then(
            m => m.ConsumePickedItemsPageComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/pick-execute',
        loadComponent: () =>
          import('./pages/fulfillment/pick-execute/pick-execute-page.component').then(
            m => m.PickExecutePageComponent,
          ),
      },
      {
        path: 'fulfillment/workorders/:workorderId/shortage-resolution',
        loadComponent: () =>
          import('./pages/fulfillment/shortage-resolution/shortage-resolution-page.component').then(
            m => m.ShortageResolutionPageComponent,
          ),
      },
      {
        path: 'security/permissions',
        loadComponent: () =>
          import('./pages/security/inventory-security-admin/inventory-security-admin-page.component').then(
            m => m.InventorySecurityAdminPageComponent,
          ),
      },
      { path: '**', redirectTo: 'availability' },
    ],
  },
];

