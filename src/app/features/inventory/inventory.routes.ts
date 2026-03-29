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
        path: 'purchase-orders',
        loadComponent: () =>
          import('./pages/purchase-orders/po-list/po-list.component').then(
            m => m.PoListComponent,
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
      { path: '**', redirectTo: 'availability' },
    ],
  },
];

