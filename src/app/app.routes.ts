import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { rolesChildGuard } from './core/guards/roles.guard';

/**
 * App-level route table.
 *
 * Public:
 *   /login    → LoginComponent
 *
 * Protected (authGuard):
 *   /app      → ShellComponent
 *     /app    → DashboardComponent (default child)
 *
 * Optional role constraints can be declared per child route:
 *   data: { roles: ['ROLE_ADMIN'] }
 *
 * Extensibility:
 *   Add new domain feature modules as additional lazy-loaded children of the
 *   /app shell route. Example:
 *
 *     {
 *       path: 'orders',
 *       loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES),
 *     }
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'forbidden',
    loadComponent: () =>
      import('./features/system/access-denied.component').then(
        m => m.AccessDeniedComponent,
      ),
  },
  {
    path: 'not-found',
    loadComponent: () =>
      import('./features/system/not-found.component').then(m => m.NotFoundComponent),
  },
  {
    path: 'chat',
    loadComponent: () =>
      import('./features/shell/components/chat-panel/chat-panel.component').then(
        m => m.ChatPanelComponent,
      ),
  },
  {
    path: 'app',
    loadComponent: () =>
      import('./features/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    canActivateChild: [rolesChildGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/shell/dashboard/dashboard.component').then(
            m => m.DashboardComponent,
          ),
      },
      {
        path: 'admin',
        data: { roles: ['ROLE_ADMIN'] },
        loadComponent: () =>
          import('./features/admin/admin.component').then(m => m.AdminComponent),
      },
      // CRM domain – Wave A (CAP-089, CAP-090, CAP-091, CAP-092)
      {
        path: 'crm',
        loadChildren: () =>
          import('./features/crm/crm.routes').then(m => m.CRM_ROUTES),
      },
      // Domain stub routes (scaffold – full implementation in future waves)
      {
        path: 'workexec',
        loadComponent: () =>
          import('./features/workexec/workexec.component').then(m => m.WorkexecComponent),
      },
      {
        path: 'accounting',
        loadComponent: () =>
          import('./features/accounting/accounting.component').then(m => m.AccountingComponent),
      },
      {
        path: 'billing',
        loadComponent: () =>
          import('./features/billing/billing.component').then(m => m.BillingComponent),
      },
      {
        path: 'people',
        loadComponent: () =>
          import('./features/people/people.component').then(m => m.PeopleComponent),
      },
      {
        path: 'location',
        loadComponent: () =>
          import('./features/location/location.component').then(m => m.LocationComponent),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./features/inventory/inventory.component').then(m => m.InventoryComponent),
      },
      {
        path: 'product',
        loadComponent: () =>
          import('./features/product/product.component').then(m => m.ProductComponent),
      },
      {
        path: 'order',
        loadComponent: () =>
          import('./features/order/order.component').then(m => m.OrderComponent),
      },
      {
        path: 'security',
        data: { roles: ['ROLE_ADMIN'] },
        loadComponent: () =>
          import('./features/security/security.component').then(m => m.SecurityComponent),
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];
