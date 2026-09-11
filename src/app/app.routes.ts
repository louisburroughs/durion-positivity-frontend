import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { rolesChildGuard } from './core/guards/roles.guard';
import {
  ACCOUNTING_PERMISSIONS,
  BILLING_PERMISSIONS,
  BULK_IMPORT_PERMISSIONS,
  CRM_PERMISSIONS,
  INVENTORY_PERMISSIONS,
  LOCATION_PERMISSIONS,
  ORDER_PERMISSIONS,
  PEOPLE_PERMISSIONS,
  PLATFORM_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  SHOPMGMT_PERMISSIONS,
  WORKEXEC_PERMISSIONS,
} from './core/security/route-permissions';

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
 * Compatibility alias:
 *   /chat     → Redirects to /app
 *
 * Access constraints are declared per child route and enforced by
 * rolesChildGuard. Prefer permissions — they are what the backend actually
 * authorizes on, decoded from the JWT perm_bits claim:
 *   data: { permissions: INVENTORY_PERMISSIONS }
 *   data: { roles: ['ROLE_ADMIN'] }
 *
 * Every domain group under /app must declare one or the other. An ungated group
 * lets any authenticated user walk into pages that can only ever 403; see
 * app.routes.spec.ts, which fails the build if a new group ships ungated.
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
        path: 'sitemap',
        loadComponent: () =>
          import('./features/sitemap/pages/sitemap/sitemap-page.component').then(
            m => m.SitemapPageComponent,
          ),
      },
      {
        path: 'admin',
        data: { roles: ['ROLE_ADMIN'] },
        loadChildren: () =>
          import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
      },
      {
        path: 'crm',
        data: { permissions: CRM_PERMISSIONS },
        loadChildren: () =>
          import('./features/crm/crm.routes').then(m => m.CRM_ROUTES),
      },
      {
        path: 'workexec',
        data: { permissions: WORKEXEC_PERMISSIONS },
        loadChildren: () =>
          import('./features/workexec/workexec.routes').then(m => m.WORKEXEC_ROUTES),
      },
      {
        path: 'accounting',
        data: { permissions: ACCOUNTING_PERMISSIONS },
        loadChildren: () =>
          import('./features/accounting/accounting.routes').then(m => m.ACCOUNTING_ROUTES),
      },
      {
        path: 'billing',
        data: { permissions: BILLING_PERMISSIONS },
        loadChildren: () =>
          import('./features/billing/billing.routes').then(m => m.BILLING_ROUTES),
      },
      {
        path: 'people',
        data: { permissions: PEOPLE_PERMISSIONS },
        loadChildren: () =>
          import('./features/people/people.routes').then(m => m.PEOPLE_ROUTES),
      },
      {
        path: 'location',
        data: { permissions: LOCATION_PERMISSIONS },
        loadChildren: () =>
          import('./features/location/location.routes').then(m => m.LOCATION_ROUTES),
      },
      {
        path: 'inventory',
        data: { permissions: INVENTORY_PERMISSIONS },
        loadChildren: () =>
          import('./features/inventory/inventory.routes').then(m => m.INVENTORY_ROUTES),
      },
      {
        path: 'product',
        data: { permissions: PRODUCT_PERMISSIONS },
        loadChildren: () =>
          import('./features/product/product.routes').then(m => m.PRODUCT_ROUTES),
      },
      {
        path: 'order',
        data: { permissions: ORDER_PERMISSIONS },
        loadChildren: () =>
          import('./features/order/order.routes').then(m => m.ORDER_ROUTES),
      },
      {
        path: 'security',
        data: { roles: ['ROLE_ADMIN'] },
        loadChildren: () =>
          import('./features/security/security.routes').then(m => m.SECURITY_ROUTES),
      },
      {
        path: 'shopmgmt',
        data: { permissions: SHOPMGMT_PERMISSIONS },
        loadChildren: () =>
          import('./features/shopmgmt/shopmgmt.routes').then(m => m.SHOPMGMT_ROUTES),
      },
      {
        path: 'bulk-import',
        data: { permissions: BULK_IMPORT_PERMISSIONS },
        loadChildren: () =>
          import('./features/bulk-import/bulk-import.routes').then(m => m.BULK_IMPORT_ROUTES),
      },
      {
        path: 'positivity',
        data: { roles: ['ROLE_ADMIN'] },
        loadChildren: () =>
          import('./features/positivity/positivity.routes').then(m => m.POSITIVITY_ROUTES),
      },
      // Platform operators only (ADR-0062 §7): `platform:*` decides when the
      // token carries perm_bits; ROLE_PLATFORM_ADMIN is the fallback for a
      // token without them. A tenant session holds neither.
      {
        path: 'platform',
        data: { roles: ['ROLE_PLATFORM_ADMIN'], permissions: PLATFORM_PERMISSIONS },
        loadChildren: () =>
          import('./features/platform/platform.routes').then(m => m.PLATFORM_ROUTES),
      },
    ],
  },
  {
    path: 'chat',
    redirectTo: 'app',
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
