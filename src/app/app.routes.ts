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
      // Domain routes — completed across Waves A–F
      {
        path: 'workexec',
        loadChildren: () =>
          import('./features/workexec/workexec.routes').then(m => m.WORKEXEC_ROUTES),
      },
      {
        path: 'accounting',
        loadChildren: () =>
          import('./features/accounting/accounting.routes').then(m => m.ACCOUNTING_ROUTES),
      },
      {
        path: 'billing',
        loadChildren: () =>
          import('./features/billing/billing.routes').then(m => m.BILLING_ROUTES),
      },
      {
        path: 'people',
        loadChildren: () =>
          import('./features/people/people.routes').then(m => m.PEOPLE_ROUTES),
      },
      {
        path: 'location',
        loadChildren: () =>
          import('./features/location/location.routes').then(m => m.LOCATION_ROUTES),
      },
      {
        path: 'inventory',
        loadChildren: () =>
          import('./features/inventory/inventory.routes').then(m => m.INVENTORY_ROUTES),
      },
      {
        path: 'product',
        loadChildren: () =>
          import('./features/product/product.routes').then(m => m.PRODUCT_ROUTES),
      },
      {
        path: 'order',
        loadChildren: () =>
          import('./features/order/order.routes').then(m => m.ORDER_ROUTES),
      },
      {
        path: 'security',
        data: { roles: ['ROLE_ADMIN'] },
        loadChildren: () =>
          import('./features/security/security.routes').then(m => m.SECURITY_ROUTES),
      },
      // Shop Management — Wave F (CAP-136–142, CAP-249)
      {
        path: 'shopmgmt',
        loadChildren: () =>
          import('./features/shopmgmt/shopmgmt.routes').then(m => m.SHOPMGMT_ROUTES),
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing-page.component').then(m => m.LandingPageComponent),
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];
